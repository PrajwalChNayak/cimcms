import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import prisma from "@models/prisma.client";
import PermissionRepository from "@repositories/permission.repository";
import RolePermissionRepository from "@repositories/rolepermission.repository";
import RoleRepository from "@repositories/role.repository";
import { getTestApp } from "./helpers/app";
import { createUserWithRole, resetDatabase } from "./helpers/auth";

const BASE = "/api/v1/user";
const COOKIE = "cimcms_rt";
const COOKIE_PATH = "/api/v1/user/token";

afterAll(async () => {
  const testPerm = await prisma.permission.findFirst({ where: { name: "DEVICE_COMMAND_TEST" } });
  if (testPerm) {
    await prisma.rolePermission.deleteMany({ where: { permissionId: testPerm.id } });
    await prisma.permission.delete({ where: { id: testPerm.id } });
  }
  await resetDatabase();
  await prisma.refreshToken.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.$disconnect();
});

const originalEnv = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

function cookieHeader(res: request.Response): string[] {
  const raw = res.headers["set-cookie"] as unknown as string[] | string | undefined;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

function refreshCookieValue(res: request.Response): string {
  const line = cookieHeader(res).find((c) => c.startsWith(`${COOKIE}=`));
  if (!line) throw new Error("no refresh cookie");
  return line.split(";")[0]!.slice(COOKIE.length + 1);
}

async function login(user: { email: string; password: string }): Promise<request.Response> {
  return request(getTestApp()).post(`${BASE}/login`).send({ email: user.email, password: user.password });
}

const refresh = (value: string): request.Test =>
  request(getTestApp()).post(`${BASE}/token/refresh`).set("Cookie", `${COOKIE}=${value}`);

describe("POST /user/login cookie", () => {
  it("sets an HttpOnly SameSite=Strict cookie on the refresh path; token not in body", async () => {
    const user = await createUserWithRole("OPERATOR");
    const res = await login(user);

    expect(res.status).toBe(200);
    const line = cookieHeader(res).find((c) => c.startsWith(`${COOKIE}=`))!;
    expect(line).toContain("HttpOnly");
    expect(line).toContain("SameSite=Strict");
    expect(line).toContain(`Path=${COOKIE_PATH}`);
    expect(line).toContain("Max-Age=");
    expect(line).not.toContain("Secure"); // only in production

    const raw = refreshCookieValue(res);
    expect(JSON.stringify(res.body)).not.toContain(raw);
    expect(res.body.result.refreshToken).toBeUndefined();
    expect(res.body.result.user).toMatchObject({ id: user.id, email: user.email, roles: ["OPERATOR"] });
    const claims = jwt.decode(res.body.result.accessToken) as { typ: string; exp: number; iat: number };
    expect(claims.typ).toBe("access");
    expect(claims.exp - claims.iat).toBe(15 * 60);
  });

  it("sets the Secure flag in production", async () => {
    const user = await createUserWithRole("OPERATOR");
    process.env.NODE_ENV = "production";
    const res = await login(user);
    process.env.NODE_ENV = "test";
    expect(cookieHeader(res).find((c) => c.startsWith(`${COOKIE}=`))).toContain("Secure");
  });
});

describe("POST /user/token/refresh", () => {
  it("rotates the token; reusing the old one fails and kills the family", async () => {
    const user = await createUserWithRole("OPERATOR");
    const first = refreshCookieValue(await login(user));

    const r1 = await refresh(first);
    expect(r1.status).toBe(200);
    expect(typeof r1.body.result.accessToken).toBe("string");
    expect(r1.body.result.refreshToken).toBeUndefined();
    const second = refreshCookieValue(r1);
    expect(second).not.toBe(first);

    // Reuse after the parallel-tab grace window (10 s): pretend the rotation was a minute ago.
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, replacedByHash: { not: null } },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });
    const reuse = await refresh(first);
    expect(reuse.status).toBe(401);
    expect(reuse.body.errorCode).toBe("UNAUTHENTICATED");

    // The newer token of the same family is now dead too.
    expect((await refresh(second)).status).toBe(401);

    const audit = await prisma.auditLog.findMany({ where: { action: "REFRESH_TOKEN_REUSE", actorId: user.id } });
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });

  it("two tabs refreshing with the same cookie both stay logged in (grace window)", async () => {
    const user = await createUserWithRole("OPERATOR");
    const shared = refreshCookieValue(await login(user));

    // Parallel, as when two tabs boot at once.
    const [a, b] = await Promise.all([refresh(shared), refresh(shared)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    // And once more right after (a retried request).
    const c = await refresh(shared);
    expect(c.status).toBe(200);

    // Every cookie handed out still works, and no reuse was recorded.
    for (const res of [a, b, c]) expect((await refresh(refreshCookieValue(res))).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: "REFRESH_TOKEN_REUSE", actorId: user.id } })).toBe(0);
  });

  it("no grace after logout: the logged-out cookie is refused", async () => {
    const user = await createUserWithRole("OPERATOR");
    const value = refreshCookieValue(await login(user));
    await request(getTestApp())
      .post(`${BASE}/token/logout`)
      .set("Cookie", `${COOKIE}=${value}`);
    expect((await refresh(value)).status).toBe(401);
  });

  it("returns 401 without cookie, with an unknown token, and with an expired token", async () => {
    const user = await createUserWithRole("OPERATOR");
    expect((await request(getTestApp()).post(`${BASE}/token/refresh`)).status).toBe(401);
    expect((await refresh("not-a-real-token")).status).toBe(401);

    const value = refreshCookieValue(await login(user));
    await prisma.refreshToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await refresh(value)).status).toBe(401);
  });

  it("stores only a hash of the token", async () => {
    const user = await createUserWithRole("OPERATOR");
    const value = refreshCookieValue(await login(user));
    const rows = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.tokenHash).not.toBe(value);
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("shows a permission change made in the DB after refresh", async () => {
    const user = await createUserWithRole("PERM_TEST_ROLE");
    const loginRes = await login(user);
    expect(loginRes.body.result.user.permissions).not.toContain("DEVICE_COMMAND_TEST");

    const role = (await RoleRepository.findOne<{ id: string }>({ name: "PERM_TEST_ROLE" }))!;
    const perm = await PermissionRepository.create<{ id: string }>({ name: "DEVICE_COMMAND_TEST" });
    await RolePermissionRepository.assign(role.id, perm.id);

    const res = await refresh(refreshCookieValue(loginRes));
    expect(res.status).toBe(200);
    expect(res.body.result.user.permissions).toContain("DEVICE_COMMAND_TEST");
    const claims = jwt.decode(res.body.result.accessToken) as { permissions: string[] };
    expect(claims.permissions).toContain("DEVICE_COMMAND_TEST");
  });

  it("rejects a blocked user", async () => {
    const user = await createUserWithRole("OPERATOR");
    const value = refreshCookieValue(await login(user));
    await prisma.user.update({ where: { id: user.id }, data: { status: "BLOCK" } });
    expect((await refresh(value)).status).toBe(401);
  });
});

describe("POST /user/token/logout", () => {
  it("revokes the token and clears the cookie", async () => {
    const user = await createUserWithRole("OPERATOR");
    const value = refreshCookieValue(await login(user));

    const res = await request(getTestApp()).post(`${BASE}/token/logout`).set("Cookie", `${COOKIE}=${value}`);
    expect(res.status).toBe(200);
    const cleared = cookieHeader(res).find((c) => c.startsWith(`${COOKIE}=`))!;
    expect(cleared).toMatch(/^cimcms_rt=;/);
    expect(cleared).toContain(`Path=${COOKIE_PATH}`);
    expect(cleared).toContain("Expires=Thu, 01 Jan 1970");

    expect((await refresh(value)).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: "LOGOUT", actorId: user.id } })).toBe(1);
  });

  it("is idempotent without a cookie", async () => {
    expect((await request(getTestApp()).post(`${BASE}/token/logout`)).status).toBe(200);
  });
});

describe("GET /user/me", () => {
  it("returns 401 without a token", async () => {
    const res = await request(getTestApp()).get(`${BASE}/me`);
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe("UNAUTHENTICATED");
  });

  it("returns CurrentUserDto from the DB", async () => {
    const user = await createUserWithRole("OPERATOR");
    const res = await request(getTestApp()).get(`${BASE}/me`).set("Authorization", `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ id: user.id, email: user.email, roles: ["OPERATOR"] });
    expect(Array.isArray(res.body.result.permissions)).toBe(true);
    expect(res.body.result.password).toBeUndefined();
  });
});

describe("authenticateToken typ claim", () => {
  const secret = (): string => process.env.JWT_SECRET_KEY as string;

  it("rejects a token whose typ is not access", async () => {
    const user = await createUserWithRole("OPERATOR");
    const bad = jwt.sign({ userId: user.id, typ: "refresh" }, secret(), { expiresIn: "5m" });
    const res = await request(getTestApp()).get(`${BASE}/me`).set("Authorization", `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });

  it("accepts a legacy token without typ", async () => {
    const user = await createUserWithRole("OPERATOR");
    const legacy = jwt.sign({ userId: user.id, email: user.email, roles: [], permissions: [] }, secret(), { expiresIn: "5m" });
    const res = await request(getTestApp()).get(`${BASE}/me`).set("Authorization", `Bearer ${legacy}`);
    expect(res.status).toBe(200);
  });

  it("rejects an expired token with 401", async () => {
    const expired = jwt.sign({ userId: "x", typ: "access" }, secret(), { expiresIn: -10 });
    const res = await request(getTestApp()).get(`${BASE}/me`).set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});

describe("production Origin check", () => {
  it("requires Origin equal to APP_BASE_URL on refresh and logout", async () => {
    const user = await createUserWithRole("OPERATOR");
    const value = refreshCookieValue(await login(user));
    process.env.NODE_ENV = "production";
    const cookie = `${COOKIE}=${value}`;
    const app = getTestApp();

    expect((await request(app).post(`${BASE}/token/refresh`).set("Cookie", cookie)).status).toBe(403);
    expect(
      (await request(app).post(`${BASE}/token/refresh`).set("Cookie", cookie).set("Origin", "https://evil.example")).status,
    ).toBe(403);
    expect(
      (await request(app).post(`${BASE}/token/logout`).set("Cookie", cookie).set("Origin", "https://evil.example")).status,
    ).toBe(403);

    const ok = await request(app)
      .post(`${BASE}/token/refresh`)
      .set("Cookie", cookie)
      .set("Origin", process.env.APP_BASE_URL as string);
    expect(ok.status).toBe(200);
  });
});

describe("audit", () => {
  it("records LOGIN_SUCCEEDED and LOGIN_FAILED (email only)", async () => {
    const user = await createUserWithRole("OPERATOR");
    await login(user);
    await request(getTestApp()).post(`${BASE}/login`).send({ email: user.email, password: "wrong-password-xyz" });

    expect(await prisma.auditLog.count({ where: { action: "LOGIN_SUCCEEDED", actorId: user.id } })).toBeGreaterThanOrEqual(1);
    const failed = await prisma.auditLog.findMany({ where: { action: "LOGIN_FAILED", actorEmail: user.email } });
    expect(failed).toHaveLength(1);
    expect(JSON.stringify(failed[0])).not.toContain("wrong-password-xyz");
  });
});
