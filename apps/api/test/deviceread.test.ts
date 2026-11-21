import { randomBytes } from "node:crypto";
import {
  auditLogDtoSchema,
  deviceEventDtoSchema,
  deviceListItemDtoSchema,
  deviceStateDtoSchema,
  telemetryPointDtoSchema,
} from "@cimcms/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { initTimeseries } from "@models/init/timeseries";
import prisma from "@models/prisma.client";
import TelemetryRepository from "@repositories/telemetry.repository";
import { getTestApp } from "./helpers/app";
import { mintToken } from "./helpers/tokens";

const API = `/${process.env.MAIN_ROUTE}`;
const app = getTestApp();
const viewer = mintToken("VIEWER");
const nobody = mintToken("VIEWER", { permissions: [] });
const deviceReadOnly = mintToken("VIEWER", { permissions: ["DEVICE_READ"] });

const paged = <T extends z.ZodType>(item: T) =>
  z.object({
    statusCode: z.number(),
    result: z.object({
      data: z.array(item),
      pagination: z.object({ total: z.number(), page: z.number(), limit: z.number(), totalPages: z.number() }),
    }),
  });

// Mirrors relayChangeDtoSchema in apps/web/src/api/deviceApi.ts.
const relayChangeSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  relay: z.number().int(),
  state: z.boolean(),
  source: z.string(),
  commandId: z.string().nullable(),
  simulation: z.boolean(),
  at: z.string(),
});

const get = (path: string, token: string | null = viewer.token) => {
  const req = request(app).get(`${API}${path}`);
  return token ? req.set("Authorization", `Bearer ${token}`) : req;
};

const NEW_ID = "LED-RD1";
const IDLE_ID = "LED-RD2";
const HUM_ID = "HUM-RD1";
const OLD_ID = "SENSOR-RD1";
let ledOid: string;
let idleOid: string;
let humOid: string;
const t0 = Date.now() - 60 * 60_000;
const audit = (n: number) => ({
  actorId: viewer.userId,
  actorEmail: viewer.email,
  actorType: "USER",
  action: n % 2 ? "ODD_ACTION" : "EVEN_ACTION",
  entity: "RdTest",
  entityId: `e${n}`,
  at: new Date(t0 + n * 1000),
});

beforeAll(async () => {
  await initTimeseries();
  await prisma.device.deleteMany({ where: { deviceId: { in: [NEW_ID, IDLE_ID, HUM_ID, OLD_ID] } } });
  const mk = (deviceId: string, deviceType: string, name?: string) =>
    prisma.device.create({ data: { deviceId, deviceType, ...(name && { name }) } });
  ledOid = (await mk(NEW_ID, "LED_CONTROLLER", "Led one")).id;
  idleOid = (await mk(IDLE_ID, "LED_CONTROLLER")).id;
  humOid = (await mk(HUM_ID, "HUMIDIFIER")).id;
  await mk(OLD_ID, "SENSOR"); // legacy device, not a CIMCMS type

  await prisma.deviceStatus.deleteMany({ where: { deviceId: NEW_ID } });
  await prisma.deviceStatus.create({
    data: {
      deviceId: NEW_ID,
      type: "LED_CONTROLLER",
      liveness: "ONLINE",
      lastSeenAt: new Date(),
      mode: "MANUAL",
      simulationMode: true,
      relayStates: Array<boolean>(16).fill(false).map((_, i) => i === 1),
      relayOnCount: 1,
    },
  });

  await TelemetryRepository.insertMany(
    [0, 1, 2].map((m) => ({
      ts: new Date(t0 + m * 60_000),
      deviceId: NEW_ID,
      type: "LED_CONTROLLER",
      mode: "MANUAL",
      simulationMode: true,
      relayStates: Array<boolean>(16).fill(m === 2),
      relayOnCount: m === 2 ? 16 : 0,
      rssiDbm: -55,
      wifiConnected: true,
      mqttConnected: true,
      rtcValid: true,
    })),
  );
  await TelemetryRepository.insert({
    ts: new Date(Date.now() - 3 * 24 * 3600_000),
    deviceId: NEW_ID,
    type: "LED_CONTROLLER",
    mode: "MANUAL",
    simulationMode: true,
    relayStates: [],
    wifiConnected: true,
    mqttConnected: true,
  });

  await prisma.deviceEvent.deleteMany({ where: { deviceId: NEW_ID } });
  await prisma.deviceEvent.createMany({
    data: [
      { deviceId: NEW_ID, type: "ONLINE", origin: "BACKEND", data: {}, receivedAt: new Date(t0) },
      { deviceId: NEW_ID, type: "STALE", origin: "BACKEND", data: { previous: "ONLINE" }, receivedAt: new Date(t0 + 1000) },
      { deviceId: NEW_ID, type: "OFFLINE", origin: "BACKEND", data: {}, receivedAt: new Date(t0 + 2000) },
    ],
  });

  await prisma.relayStateChange.deleteMany({ where: { deviceId: NEW_ID } });
  await prisma.relayStateChange.createMany({
    data: [
      { deviceId: NEW_ID, relay: 2, state: true, source: "COMMAND", commandId: "c-1", simulation: true, at: new Date(t0) },
      { deviceId: NEW_ID, relay: 3, state: true, source: "UNKNOWN", simulation: true, at: new Date(t0 + 1000) },
      { deviceId: NEW_ID, relay: 2, state: false, source: "COMMAND", commandId: "c-2", simulation: true, at: new Date(t0 + 2000) },
    ],
  });

  await prisma.auditLog.deleteMany({ where: { entity: "RdTest" } });
  await prisma.auditLog.createMany({ data: [1, 2, 3, 4, 5].map(audit) });
});

afterAll(async () => {
  await prisma.device.deleteMany({ where: { deviceId: { in: [NEW_ID, IDLE_ID, HUM_ID, OLD_ID] } } });
  await prisma.deviceStatus.deleteMany({ where: { deviceId: NEW_ID } });
  await prisma.deviceEvent.deleteMany({ where: { deviceId: NEW_ID } });
  await prisma.relayStateChange.deleteMany({ where: { deviceId: NEW_ID } });
  await prisma.auditLog.deleteMany({ where: { entity: "RdTest" } });
  await prisma.$disconnect();
});

describe("permission and validation (all read routes)", () => {
  const paths = [
    "/devices",
    "/devices/aaaaaaaaaaaaaaaaaaaaaaaa/state",
    "/devices/aaaaaaaaaaaaaaaaaaaaaaaa/telemetry",
    "/devices/aaaaaaaaaaaaaaaaaaaaaaaa/events",
    "/devices/aaaaaaaaaaaaaaaaaaaaaaaa/relay-changes",
    "/audit",
  ];

  it.each(paths)("%s: 401 without a token", async (p) => {
    const res = await get(p, null);
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe("UNAUTHENTICATED");
  });

  it.each(paths)("%s: 403 without the permission", async (p) => {
    const res = await get(p, nobody.token);
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe("FORBIDDEN");
  });

  it("/audit needs AUDIT_READ, not DEVICE_READ", async () => {
    expect((await get("/audit", deviceReadOnly.token)).status).toBe(403);
    expect((await get("/devices", deviceReadOnly.token)).status).toBe(200);
  });

  it("rejects bad params and queries with VALIDATION_FAILED", async () => {
    for (const p of [
      "/devices/not-an-id/state",
      `/devices/${ledOid}/telemetry?limit=0`,
      `/devices/${ledOid}/telemetry?from=yesterday`,
      `/devices/${ledOid}/events?type=NOPE`,
      `/devices/${ledOid}/relay-changes?relay=17`,
      "/devices?type=TOASTER",
      "/devices?limit=101",
      "/audit?actorId=xyz",
    ]) {
      const res = await get(p);
      expect(res.status, p).toBe(400);
      expect(res.body.errorCode, p).toBe("VALIDATION_FAILED");
    }
  });

  it("unknown device id gives 404 DEVICE_NOT_FOUND on every device route", async () => {
    const unknown = randomBytes(12).toString("hex");
    for (const leaf of ["state", "telemetry", "events", "relay-changes"]) {
      const res = await get(`/devices/${unknown}/${leaf}`);
      expect(res.status, leaf).toBe(404);
      expect(res.body.errorCode, leaf).toBe("DEVICE_NOT_FOUND");
    }
  });
});

describe("GET /devices", () => {
  it("lists CIMCMS-type devices with their state, parsed by the contracts DTO", async () => {
    const res = await get("/devices?limit=100");
    expect(res.status).toBe(200);
    const body = paged(deviceListItemDtoSchema).parse(res.body);
    const byId = new Map(body.result.data.map((d) => [d.deviceId, d]));
    expect(byId.get(NEW_ID)).toMatchObject({ id: ledOid, name: "Led one", type: "LED_CONTROLLER" });
    expect(byId.get(NEW_ID)?.state?.relayOnCount).toBe(1);
    expect(byId.get(NEW_ID)?.state?.simulationMode).toBe(true);
    expect(byId.get(IDLE_ID)?.state).toBeNull();
    expect(byId.get(IDLE_ID)?.name).toBe(IDLE_ID); // falls back to the physical id
    expect(byId.get(HUM_ID)?.type).toBe("HUMIDIFIER");
    expect(byId.has(OLD_ID)).toBe(false);
  });

  it("filters by type and paginates", async () => {
    const res = await get("/devices?type=HUMIDIFIER&limit=100");
    const ids = paged(deviceListItemDtoSchema).parse(res.body).result.data.map((d) => d.deviceId);
    expect(ids).toContain(HUM_ID);
    expect(ids).not.toContain(NEW_ID);

    const p1 = paged(deviceListItemDtoSchema).parse((await get("/devices?type=LED_CONTROLLER&limit=1&page=1")).body);
    expect(p1.result.data).toHaveLength(1);
    expect(p1.result.pagination).toMatchObject({ page: 1, limit: 1 });
    expect(p1.result.pagination.total).toBeGreaterThanOrEqual(2);
    expect(p1.result.pagination.totalPages).toBe(p1.result.pagination.total);
  });
});

describe("GET /devices/:id/state", () => {
  it("returns the snapshot", async () => {
    const res = await get(`/devices/${ledOid}/state`);
    expect(res.status).toBe(200);
    const dto = deviceStateDtoSchema.parse(res.body.result);
    expect(dto).toMatchObject({ deviceId: NEW_ID, liveness: "ONLINE", mode: "MANUAL", relayOnCount: 1 });
    expect(dto.relayStates).toHaveLength(16);
    expect(dto.relayStates[1]).toBe(true);
  });

  it("device never seen: 200 with an empty snapshot", async () => {
    const res = await get(`/devices/${idleOid}/state`);
    expect(res.status).toBe(200);
    expect(deviceStateDtoSchema.parse(res.body.result)).toMatchObject({
      deviceId: IDLE_ID,
      liveness: "UNKNOWN",
      relayStates: [],
      relayOnCount: 0,
      lastSeenAt: null,
    });
  });

  it("works for the humidifier", async () => {
    const res = await get(`/devices/${humOid}/state`);
    expect(res.status).toBe(200);
    expect(deviceStateDtoSchema.parse(res.body.result).type).toBe("HUMIDIFIER");
  });
});

describe("GET /devices/:id/telemetry", () => {
  it("returns a plain array, newest first, default window 24 h", async () => {
    const res = await get(`/devices/${ledOid}/telemetry`);
    expect(res.status).toBe(200);
    const points = z.array(telemetryPointDtoSchema).parse(res.body.result);
    expect(points).toHaveLength(3); // the 3-day-old point is outside the default window
    expect(points.map((p) => p.relayOnCount)).toEqual([16, 0, 0]);
    const times = points.map((p) => Date.parse(p.ts));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(points[0]).toMatchObject({ simulationMode: true, rssiDbm: -55, rtcValid: true });
  });

  it("honours from, to and limit", async () => {
    const old = z
      .array(telemetryPointDtoSchema)
      .parse((await get(`/devices/${ledOid}/telemetry?from=${new Date(Date.now() - 4 * 24 * 3600_000).toISOString()}&limit=1000`)).body.result);
    expect(old).toHaveLength(4);
    const one = (await get(`/devices/${ledOid}/telemetry?limit=1`)).body.result as unknown[];
    expect(one).toHaveLength(1);
    const to = new Date(t0 + 30_000).toISOString();
    const early = (await get(`/devices/${ledOid}/telemetry?to=${to}`)).body.result as unknown[];
    expect(early).toHaveLength(1);
  });
});

describe("GET /devices/:id/events", () => {
  it("is paginated, newest first", async () => {
    const res = await get(`/devices/${ledOid}/events?limit=2`);
    expect(res.status).toBe(200);
    const body = paged(deviceEventDtoSchema).parse(res.body);
    expect(body.result.data.map((e) => e.type)).toEqual(["OFFLINE", "STALE"]);
    expect(body.result.pagination).toMatchObject({ total: 3, page: 1, limit: 2, totalPages: 2 });
    const p2 = paged(deviceEventDtoSchema).parse((await get(`/devices/${ledOid}/events?limit=2&page=2`)).body);
    expect(p2.result.data.map((e) => e.type)).toEqual(["ONLINE"]);
  });

  it("filters by type and by time range", async () => {
    const byType = paged(deviceEventDtoSchema).parse((await get(`/devices/${ledOid}/events?type=STALE`)).body);
    expect(byType.result.data).toHaveLength(1);
    const from = new Date(t0 + 500).toISOString();
    const to = new Date(t0 + 1500).toISOString();
    const ranged = paged(deviceEventDtoSchema).parse((await get(`/devices/${ledOid}/events?from=${from}&to=${to}`)).body);
    expect(ranged.result.data.map((e) => e.type)).toEqual(["STALE"]);
  });
});

describe("GET /devices/:id/relay-changes", () => {
  it("is paginated, newest first, in the shape the web client parses", async () => {
    const res = await get(`/devices/${ledOid}/relay-changes`);
    expect(res.status).toBe(200);
    const body = paged(relayChangeSchema).parse(res.body);
    expect(body.result.data.map((r) => [r.relay, r.state])).toEqual([[2, false], [3, true], [2, true]]);
    expect(body.result.data[2]).toMatchObject({ source: "COMMAND", commandId: "c-1", simulation: true, deviceId: NEW_ID });
    expect(body.result.data[1]?.commandId).toBeNull();
    expect(body.result.pagination.total).toBe(3);
  });

  it("filters by relay and range", async () => {
    const r2 = paged(relayChangeSchema).parse((await get(`/devices/${ledOid}/relay-changes?relay=2`)).body);
    expect(r2.result.data).toHaveLength(2);
    const to = new Date(t0 + 500).toISOString();
    const early = paged(relayChangeSchema).parse((await get(`/devices/${ledOid}/relay-changes?to=${to}`)).body);
    expect(early.result.data).toHaveLength(1);
  });
});

describe("GET /audit", () => {
  it("is paginated, newest first, and filterable", async () => {
    const res = await get("/audit?entity=RdTest&limit=2");
    expect(res.status).toBe(200);
    const body = paged(auditLogDtoSchema).parse(res.body);
    expect(body.result.data.map((a) => a.entityId)).toEqual(["e5", "e4"]);
    expect(body.result.pagination).toMatchObject({ total: 5, totalPages: 3 });

    const odd = paged(auditLogDtoSchema).parse((await get("/audit?entity=RdTest&action=ODD_ACTION")).body);
    expect(odd.result.data).toHaveLength(3);
    const mine = paged(auditLogDtoSchema).parse((await get(`/audit?entity=RdTest&actorId=${viewer.userId}`)).body);
    expect(mine.result.data).toHaveLength(5);
    const other = paged(auditLogDtoSchema).parse((await get(`/audit?entity=RdTest&actorId=${randomBytes(12).toString("hex")}`)).body);
    expect(other.result.data).toHaveLength(0);

    const from = new Date(t0 + 2500).toISOString();
    const to = new Date(t0 + 4500).toISOString();
    const ranged = paged(auditLogDtoSchema).parse((await get(`/audit?entity=RdTest&from=${from}&to=${to}`)).body);
    expect(ranged.result.data.map((a) => a.entityId)).toEqual(["e4", "e3"]);
  });
});
