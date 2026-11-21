import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import prisma from "@models/prisma.client";
import { createUserWithRole, resetDatabase } from "./helpers/auth";
import { getTestApp } from "./helpers/app";

const LOGIN = "/api/v1/user/login";

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("POST /user/login", () => {
  it("returns a token for valid credentials", async () => {
    const user = await createUserWithRole("SUPER_ADMIN");

    const res = await request(getTestApp())
      .post(LOGIN)
      .send({ email: user.email, password: user.password });

    expect(res.status).toBe(200);
    expect(res.body.result.user.id).toBe(user.id);
    expect(typeof res.body.result.accessToken).toBe("string");
  });

  it("returns 401 for a wrong password", async () => {
    const user = await createUserWithRole("OPERATOR");

    const res = await request(getTestApp())
      .post(LOGIN)
      .send({ email: user.email, password: "definitely-wrong" });

    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe("AUTHENTICATION_ERROR");
  });
});

describe("login rate limit", () => {
  it("allows 10 attempts per IP+email and returns 429 on the 11th", async () => {
    const app = getTestApp();
    const email = "ratelimit@test.local";
    const statuses: number[] = [];

    for (let i = 0; i < 11; i++) {
      const res = await request(app)
        .post(LOGIN)
        .send({ email, password: "wrong-password" });
      statuses.push(res.status);
      if (i === 10) expect(res.body.errorCode).toBe("RATE_LIMITED");
    }

    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("sends helmet security headers", async () => {
    const res = await request(getTestApp()).post(LOGIN).send({});
    expect(res.headers["strict-transport-security"]).toContain("max-age=63072000");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
