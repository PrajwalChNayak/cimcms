import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "@models/prisma.client";
import { seedRbac } from "@models/seed/rbac";
import Argon from "@utils/argon.utils";
import { getTestApp } from "./helpers/app";
import { createUserWithRole, resetDatabase } from "./helpers/auth";
import { mintToken } from "./helpers/tokens";

/**
 * Regression tests for the privilege-escalation holes found in review (2026-11-22):
 * unauthenticated legacy routes, role/permission management open to any token,
 * user creation and password reset open to any token, consumer tokens on staff routes.
 */
const API = "/api/v1";
const MISSING = "00000000-0000-4000-8000-000000000000";

const call = (method: "get" | "post" | "put" | "delete", path: string, token?: string | null, body?: object) => {
  let req = request(getTestApp())[method](`${API}${path}`);
  if (token) req = req.set("Authorization", `Bearer ${token}`);
  return body ? req.send(body) : req;
};

/** A token shaped like a consumer token from public POST /auth/register: no typ, no roles, no permissions. */
const consumerToken = (): string =>
  jwt.sign({ email: "consumer@test.local", userId: randomUUID() }, process.env.JWT_SECRET_KEY as string, {
    expiresIn: "1h",
  });

let superAdminRoleId: string;

beforeAll(async () => {
  await seedRbac(prisma);
  superAdminRoleId = (await prisma.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } })).id;
});

afterAll(async () => {
  await resetDatabase();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.$disconnect();
});

describe("legacy routes need authentication", () => {
  it.each([
    ["post", "/devices/register"],
    ["post", "/devices/farmer"],
    ["get", "/devices/consumer"],
    ["get", `/devices/${MISSING}`],
    ["put", `/devices/${MISSING}`],
    ["delete", `/devices/${MISSING}`],
    ["post", "/farms"],
    ["get", "/farms/consumer"],
    ["get", `/farms/${MISSING}`],
    ["put", `/farms/${MISSING}`],
    ["delete", `/farms/${MISSING}`],
    ["post", "/master/constant"],
    ["get", "/master/constant"],
    ["get", "/master/constant/types"],
    ["get", "/auth/me"],
    ["get", "/auth/token/refresh"],
  ] as const)("%s %s without a token is 401", async (method, path) => {
    const res = await call(method, path, null, {});
    expect(res.status).toBe(401);
  });

  it("device writes need DEVICE_MANAGE", async () => {
    const operator = mintToken("OPERATOR");
    const res = await call("delete", `/devices/${MISSING}`, operator.token);
    expect(res.status).toBe(403);
  });
});

describe("role and permission management", () => {
  it.each([
    ["post", "/user/role", { name: "EVIL" }],
    ["put", `/user/role/${MISSING}`, { name: "EVIL" }],
    ["put", `/user/role/toggle/${MISSING}`, {}],
    ["post", "/user/permission", { name: "EVIL" }],
    ["put", `/user/permission/${MISSING}`, { name: "EVIL" }],
    ["post", "/user/role/permission", { roleId: MISSING, permissionId: MISSING }],
    ["delete", "/user/role/permission", { roleId: MISSING, permissionId: MISSING }],
    ["post", "/user/assign/role", { userId: MISSING, roleId: MISSING }],
  ] as const)("%s %s is SUPER_ADMIN only (VIEWER and ADMIN get 403)", async (method, path, body) => {
    expect((await call(method, path, mintToken("VIEWER").token, body)).status).toBe(403);
    expect((await call(method, path, mintToken("ADMIN").token, body)).status).toBe(403);
  });

  it("listing roles needs ROLE_READ", async () => {
    expect((await call("get", "/user/role", mintToken("VIEWER").token)).status).toBe(403);
  });

  it("a consumer token never passes a permission or role guard", async () => {
    const t = consumerToken();
    expect((await call("get", "/devices", t)).status).toBe(403);
    expect((await call("post", "/user/role/permission", t, {})).status).toBe(403);
    expect((await call("post", "/user", t, {})).status).toBe(403);
  });
});

describe("user creation and password reset", () => {
  const userBody = (roles?: string[]) => ({
    email: `new-${randomUUID()}@test.local`,
    password: "a-long-enough-password",
    name: "New user",
    ...(roles && { roles }),
  });

  it("POST /user needs USER_CREATE", async () => {
    expect((await call("post", "/user", mintToken("VIEWER").token, userBody())).status).toBe(403);
  });

  it("only a SUPER_ADMIN can grant SUPER_ADMIN", async () => {
    const admin = mintToken("ADMIN", { permissions: ["USER_CREATE"] });
    const res = await call("post", "/user", admin.token, userBody([superAdminRoleId]));
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe("FORBIDDEN");
  });

  it("rejects a short password", async () => {
    const admin = mintToken("ADMIN", { permissions: ["USER_CREATE"] });
    const res = await call("post", "/user", admin.token, { ...userBody(), password: "short" });
    expect(res.status).toBe(400);
  });

  it("reset-password needs USER_UPDATE and cannot touch a SUPER_ADMIN unless the caller is one", async () => {
    const target = await createUserWithRole("SUPER_ADMIN");
    const body = { email: target.email, newPassword: "another-long-password" };
    expect((await call("post", "/user/reset-password", mintToken("VIEWER").token, body)).status).toBe(403);

    const admin = mintToken("ADMIN", { permissions: ["USER_UPDATE"] });
    const res = await call("post", "/user/reset-password", admin.token, body);
    expect(res.status).toBe(403);

    // The original password still works.
    const login = await call("post", "/user/login", null, { email: target.email, password: target.password });
    expect(login.status).toBe(200);
  });
});

describe("login hardening", () => {
  it("does not reveal that an account is inactive to a wrong password", async () => {
    const email = `inactive-${randomUUID()}@test.local`;
    await prisma.user.create({
      data: { email, password: await Argon.hashPassword("the-right-password"), status: "INACTIVE" },
    });
    const res = await call("post", "/user/login", null, { email, password: "a-wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });

  it("a disabled role grants no permissions", async () => {
    const user = await createUserWithRole("OPERATOR");
    await prisma.role.update({ where: { name: "OPERATOR" }, data: { status: "INACTIVE" } });
    try {
      const login = await call("post", "/user/login", null, { email: user.email, password: user.password });
      expect(login.status).toBe(200);
      expect(login.body.result.user.roles).toEqual([]);
      expect(login.body.result.user.permissions).toEqual([]);
    } finally {
      await prisma.role.update({ where: { name: "OPERATOR" }, data: { status: "ACTIVE" } });
    }
  });
});
