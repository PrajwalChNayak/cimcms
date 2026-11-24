import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "@models/prisma.client";
import { getTestApp } from "./helpers/app";
import { mintToken } from "./helpers/tokens";

/** Device registration and editing from the web UI (POST /devices/register, PUT /devices/:id). */
const API = "/api/v1";
const IDS = ["LED-DM-1", "HUM-DM-1"];
const admin = mintToken("ADMIN");
const operator = mintToken("OPERATOR");

const post = (path: string, token: string, body: object) =>
  request(getTestApp()).post(`${API}${path}`).set("Authorization", `Bearer ${token}`).send(body);
const put = (path: string, token: string, body: object) =>
  request(getTestApp()).put(`${API}${path}`).set("Authorization", `Bearer ${token}`).send(body);
const listed = async (deviceId: string) => {
  const res = await request(getTestApp()).get(`${API}/devices?limit=100`).set("Authorization", `Bearer ${admin.token}`);
  return (res.body.result.data as { id: string; deviceId: string; name: string; location?: string; type: string }[]).find(
    (d) => d.deviceId === deviceId,
  );
};

beforeEach(async () => {
  await prisma.device.deleteMany({ where: { deviceId: { in: IDS } } });
});

afterAll(async () => {
  await prisma.device.deleteMany({ where: { deviceId: { in: IDS } } });
  await prisma.$disconnect();
});

describe("POST /devices/register", () => {
  it("registers a device with name and location; it shows up in GET /devices", async () => {
    const res = await post("/devices/register", admin.token, {
      deviceId: "LED-DM-1",
      deviceType: "LED_CONTROLLER",
      name: "Room A lights",
      location: "Grow room A",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await listed("LED-DM-1")).toMatchObject({
      name: "Room A lights",
      location: "Grow room A",
      type: "LED_CONTROLLER",
    });
  });

  it("refuses a duplicate device id with 409", async () => {
    const body = { deviceId: "LED-DM-1", deviceType: "LED_CONTROLLER" };
    expect((await post("/devices/register", admin.token, body)).status).toBe(201);
    expect((await post("/devices/register", admin.token, body)).status).toBe(409);
  });

  it("validates the id and refuses planned device types", async () => {
    expect((await post("/devices/register", admin.token, { deviceId: "x", deviceType: "LED_CONTROLLER" })).status).toBe(400);
    expect((await post("/devices/register", admin.token, { deviceId: "LED DM 1", deviceType: "LED_CONTROLLER" })).status).toBe(400);
    expect((await post("/devices/register", admin.token, { deviceId: "HUM-DM-1", deviceType: "STEAM_GENERATOR" })).status).toBe(400);
    expect((await post("/devices/register", admin.token, { deviceId: "HUM-DM-1", deviceType: "HUMIDIFIER" })).status).toBe(201);
  });

  it("needs DEVICE_MANAGE", async () => {
    const res = await post("/devices/register", operator.token, { deviceId: "LED-DM-1", deviceType: "LED_CONTROLLER" });
    expect(res.status).toBe(403);
  });
});

describe("PUT /devices/:id", () => {
  it("changes name and location only", async () => {
    await post("/devices/register", admin.token, { deviceId: "LED-DM-1", deviceType: "LED_CONTROLLER" });
    const { id } = (await listed("LED-DM-1"))!;

    const res = await put(`/devices/${id}`, admin.token, { name: "Renamed", location: "Room B" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await listed("LED-DM-1")).toMatchObject({ name: "Renamed", location: "Room B" });

    // deviceId and type are not editable (strict body).
    expect((await put(`/devices/${id}`, admin.token, { deviceId: "LED-OTHER" })).status).toBe(400);
    expect((await put(`/devices/${id}`, operator.token, { name: "x" })).status).toBe(403);
  });
});
