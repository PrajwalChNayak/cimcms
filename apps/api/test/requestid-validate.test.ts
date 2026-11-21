import express from "express";
import "express-async-errors";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import errorHandler from "@middleware/errorhandler.middleware";
import requestId from "@middleware/requestid.middleware";
import { validate } from "@middleware/validate.middleware";
import { getTestApp } from "./helpers/app";

function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.post(
    "/items/:id",
    validate({
      params: z.object({ id: z.coerce.number().int() }),
      query: z.object({ limit: z.coerce.number().default(10) }),
      body: z.object({ name: z.string().min(1) }),
    }),
    (req, res) => {
      res.json({ params: req.params, query: req.query, body: req.body });
    },
  );
  app.use(errorHandler);
  return app;
}

describe("request id", () => {
  it("echoes a valid incoming X-Request-Id", async () => {
    const res = await request(getTestApp()).get("/nope").set("X-Request-Id", "abc-12345678");
    expect(res.headers["x-request-id"]).toBe("abc-12345678");
    expect(res.body.requestId).toBe("abc-12345678");
  });

  it("generates one when absent", async () => {
    const res = await request(getTestApp()).get("/nope");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
    expect(res.body.errorCode).toBeDefined();
  });

  it("replaces a malformed incoming id", async () => {
    const res = await request(getTestApp()).get("/nope").set("X-Request-Id", "bad id!");
    expect(res.headers["x-request-id"]).not.toBe("bad id!");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("validate middleware", () => {
  it("rejects an invalid body with 400 VALIDATION_FAILED and issue details", async () => {
    const res = await request(buildApp()).post("/items/1").send({ name: "" });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe("VALIDATION_FAILED");
    expect(res.body.requestId).toBeTruthy();
    expect(res.body.details[0]).toMatchObject({ in: "body", path: ["name"] });
  });

  it("collects issues across parts", async () => {
    const res = await request(buildApp()).post("/items/abc").send({});
    expect(res.status).toBe(400);
    const parts = res.body.details.map((d: { in: string }) => d.in);
    expect(parts).toContain("params");
    expect(parts).toContain("body");
  });

  it("replaces params, query and body with parsed values", async () => {
    const res = await request(buildApp()).post("/items/7?limit=5").send({ name: "x" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ params: { id: 7 }, query: { limit: 5 }, body: { name: "x" } });
  });
});
