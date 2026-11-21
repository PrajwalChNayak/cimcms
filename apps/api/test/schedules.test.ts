import { configWireSchema, MAX_CONFIG_PAYLOAD_BYTES, topicFor } from "@cimcms/contracts";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "@/createApp";
import MqttClient from "@/mqtt/mqtt.client";
import prisma from "@models/prisma.client";
import ConfigService from "@services/config.service";
import { LED, startRig, type Rig } from "./rig";
import { mintToken } from "./helpers/tokens";
import { waitFor } from "./helpers/wait";

const API = `/${process.env.MAIN_ROUTE}`;
const ALL = [1, 2, 3, 4, 5, 6, 7];

let rig: Rig;
let app: ReturnType<typeof createApp>;
let ledOid: string;
let roomA: string;
let roomB: string;

const tokens = {
  viewer: mintToken("VIEWER"),
  technician: mintToken("TECHNICIAN"),
  operator: mintToken("OPERATOR"),
  admin: mintToken("ADMIN"),
  writeOnly: mintToken("OPERATOR", { permissions: ["DEVICE_READ", "SCHEDULE_READ", "SCHEDULE_WRITE"] }),
};
type Who = keyof typeof tokens;

const call = (method: "get" | "post" | "put", path: string, who: Who | null, body?: object) => {
  let req = request(app)[method](`${API}${path}`);
  if (who) req = req.set("Authorization", `Bearer ${tokens[who].token}`);
  return body ? req.send(body) : who && method !== "get" ? req.send({}) : req;
};

const today = (offsetDays = 0): string =>
  new Date(Date.now() + 330 * 60_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

const rule = (on: string, off: string, days = ALL) => ({ days, on, off });
const body = (over: Record<string, unknown> = {}) => ({
  roomId: roomA,
  name: "Daily light",
  rules: [rule("06:00", "18:00")],
  effectiveFrom: today(-1),
  ...over,
});

async function assign(room: string, relays: number[]): Promise<void> {
  await prisma.roomChannelAssignment.createMany({
    data: relays.map((relay) => ({ roomId: room, deviceId: LED.deviceId, relay })),
  });
}

async function onlineDevice(opts: Parameters<Rig["sim"]>[0] = {}) {
  const sim = await rig.sim({ executorIntervalMs: 0, ...opts });
  await waitFor(async () => (await rig.status())?.relayStates.length === 16, 5000, "device online");
  return sim;
}

const latestConfig = () =>
  prisma.deviceConfig.findFirst({ where: { deviceId: LED.deviceId }, orderBy: { configVersion: "desc" } });

async function create(who: Who = "operator", over: Record<string, unknown> = {}) {
  const res = await call("post", "/schedules", who, body(over));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.result as { id: string };
}

beforeAll(async () => {
  rig = await startRig([LED]);
  app = createApp();
  ledOid = (await prisma.device.findUniqueOrThrow({ where: { deviceId: LED.deviceId } })).id;
});

afterAll(async () => {
  await wipe();
  await prisma.auditLog.deleteMany({ where: { entity: { in: ["Schedule", "Room", "DeviceConfig", "Command"] } } });
  await rig.stop();
});

async function wipe(): Promise<void> {
  await prisma.deviceConfig.deleteMany({});
  await prisma.scheduleVersion.deleteMany({});
  await prisma.schedule.deleteMany({});
  await prisma.roomChannelAssignment.deleteMany({});
  await prisma.room.deleteMany({});
}

beforeEach(async () => {
  await rig.settle();
  await rig.reset();
  await wipe();
  // Retained configs of earlier tests must not reach this test's simulator.
  await MqttClient.publish(topicFor("LED_CONTROLLER", LED.deviceId, "config"), "", { qos: 1, retain: true });
  // TODO(owner-decision O-9): fixture rooms only.
  roomA = (await prisma.room.create({ data: { code: "TRA", name: "Test Room A" } })).id;
  roomB = (await prisma.room.create({ data: { code: "TRB", name: "Test Room B" } })).id;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("schedule CRUD and validation", () => {
  it("permissions: viewer reads, technician cannot write, publish needs SCHEDULE_PUBLISH", async () => {
    const { id } = await create("operator");
    expect((await call("get", "/schedules", null)).status).toBe(401);
    expect((await call("get", "/schedules", "viewer")).status).toBe(200);
    expect((await call("get", `/schedules/${id}`, "technician")).status).toBe(200);
    expect((await call("post", "/schedules", "technician", body())).status).toBe(403);
    expect((await call("post", "/schedules", "viewer", body())).status).toBe(403);
    expect((await call("put", `/schedules/${id}`, "viewer", { name: "x" })).status).toBe(403);
    const denied = await call("post", `/schedules/${id}/publish`, "writeOnly");
    expect(denied.status).toBe(403);
    expect(denied.body.errorCode).toBe("FORBIDDEN");
  });

  it("creates a draft with version 1, lists and fetches it, with room names", async () => {
    const { id } = await create("operator", { effectiveTo: today(30) });
    const got = await call("get", `/schedules/${id}`, "viewer");
    expect(got.body.result).toMatchObject({
      roomId: roomA,
      roomCode: "TRA",
      roomName: "Test Room A",
      name: "Daily light",
      status: "DRAFT",
      latestVersion: 1,
      publishedVersion: null,
      published: null,
      latest: { version: 1, effectiveFrom: today(-1), effectiveTo: today(30), publishedAt: null },
    });
    expect(got.body.result.latest.rules).toEqual([rule("06:00", "18:00")]);
    const list = await call("get", `/schedules?roomId=${roomA}&status=DRAFT`, "viewer");
    expect(list.body.result.data).toHaveLength(1);
    expect((await call("get", `/schedules?status=PUBLISHED`, "viewer")).body.result.data).toHaveLength(0);
    expect((await call("get", "/schedules/aaaaaaaaaaaaaaaaaaaaaaaa", "viewer")).body.errorCode).toBe("SCHEDULE_NOT_FOUND");
  });

  it("rejects overlapping windows with SCHEDULE_OVERLAP and details", async () => {
    const res = await call("post", "/schedules", "operator", body({
      rules: [rule("06:00", "12:00", [1, 2]), rule("11:00", "14:00", [2])],
    }));
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe("SCHEDULE_OVERLAP");
    expect(res.body.details.overlaps).toEqual([{ windowA: 0, windowB: 1, from: "Tue 11:00", to: "Tue 12:00" }]);
    // windows that only touch are fine
    expect((await call("post", "/schedules", "operator", body({
      rules: [rule("06:00", "12:00"), rule("12:00", "18:00")],
    }))).status).toBe(201);
  });

  it("validates input: on == off, duplicate days, bad dates, unknown room, one schedule per room", async () => {
    const bad = async (over: Record<string, unknown>) => (await call("post", "/schedules", "operator", body(over))).body.errorCode;
    expect(await bad({ rules: [rule("08:00", "08:00")] })).toBe("VALIDATION_FAILED");
    expect(await bad({ rules: [{ days: [1, 1], on: "06:00", off: "07:00" }] })).toBe("VALIDATION_FAILED");
    expect(await bad({ effectiveFrom: "2026-13-40" })).toBe("VALIDATION_FAILED");
    expect(await bad({ effectiveTo: today(-5) })).toBe("VALIDATION_FAILED");
    expect(await bad({ roomId: "b".repeat(24) })).toBe("ROOM_NOT_FOUND");
    await create("operator");
    const dup = await call("post", "/schedules", "operator", body({ name: "Another" }));
    expect(dup.status).toBe(409);
    expect(dup.body.errorCode).toBe("SCHEDULE_EXISTS_FOR_ROOM");
    // another room is fine
    expect((await call("post", "/schedules", "operator", body({ roomId: roomB, name: "B" }))).status).toBe(201);
  });

  it("edits a draft in place and creates the next draft version after a publish (published versions are immutable)", async () => {
    const { id } = await create("operator");
    const e1 = await call("put", `/schedules/${id}`, "operator", { name: "Renamed", rules: [rule("07:00", "19:00")] });
    expect(e1.body.result).toMatchObject({ name: "Renamed", latestVersion: 1 });
    expect(e1.body.result.latest.rules).toEqual([rule("07:00", "19:00")]);

    expect((await call("post", `/schedules/${id}/publish`, "operator")).status).toBe(200);
    const again = await call("post", `/schedules/${id}/publish`, "operator");
    expect(again.status).toBe(409);
    expect(again.body.errorCode).toBe("SCHEDULE_NOTHING_TO_PUBLISH");

    const e2 = await call("put", `/schedules/${id}`, "operator", { rules: [rule("08:00", "20:00")] });
    expect(e2.body.result).toMatchObject({ latestVersion: 2, publishedVersion: 1, status: "PUBLISHED" });
    expect(e2.body.result.published.rules).toEqual([rule("07:00", "19:00")]);
    expect(e2.body.result.latest.rules).toEqual([rule("08:00", "20:00")]);
    expect(e2.body.result.latest.publishedAt).toBeNull();

    const versions = await call("get", `/schedules/${id}/versions`, "viewer");
    expect(versions.body.result.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions.body.result[1].publishedAt).not.toBeNull();
    const v1 = await prisma.scheduleVersion.findFirstOrThrow({ where: { scheduleId: id, version: 1 } });
    expect(v1.rules).toEqual([rule("07:00", "19:00")]);
    expect((await call("put", `/schedules/${id}`, "operator", {})).status).toBe(400);
  });
});

describe("publish, config and device acknowledgement", () => {
  it("publishes a retained config the device applies; status goes PUBLISHED -> APPLIED, AUTO becomes ready", async () => {
    await assign(roomA, [1, 2, 3]);
    await assign(roomB, [4]);
    const sim = await onlineDevice();
    const { id } = await create("operator");

    const res = await call("post", `/schedules/${id}/publish`, "operator");
    expect(res.status).toBe(200);
    expect(res.body.result.schedule).toMatchObject({ status: "PUBLISHED", publishedVersion: 1 });
    expect(res.body.result.configs).toHaveLength(1);
    expect(res.body.result.configs[0]).toMatchObject({
      deviceId: LED.deviceId,
      configVersion: 1,
      sourceVersions: [{ scheduleId: id, version: 1 }],
    });

    const row = await waitFor(
      async () => {
        const r = await latestConfig();
        return r?.status === "APPLIED" ? r : null;
      },
      4000,
      "config applied",
    );
    expect(row.appliedAt).not.toBeNull();
    const wire = configWireSchema.parse(row.payload);
    expect(wire.auto?.channels.map((c) => c.relay)).toEqual([1, 2, 3]); // relay 4 belongs to room B
    expect(wire.auto?.channels[0]?.windows).toEqual([rule("06:00", "18:00")]);
    expect(wire.auto).toMatchObject({ effective_from: today(-1), effective_to: null });
    expect(wire.experiment).toBeNull();
    expect(sim.state.config?.config_version).toBe(1);

    // the device acknowledgement is pushed to the browsers (schedule:updated) and mirrored in telemetry
    expect(rig.emits.some((e) => e.event === "schedule:updated" && e.deviceId === LED.deviceId)).toBe(true);
    await waitFor(async () => (await rig.status()) && (await prisma.deviceStatus.findUnique({ where: { deviceId: LED.deviceId } }))?.configVersion === 1, 3000, "telemetry config version");

    const ready = await call("get", `/devices/${ledOid}/readiness`, "viewer");
    expect(ready.body.result.auto).toMatchObject({ ready: true, reasons: [], configVersion: 1 });

    const status = await call("get", `/schedules/${id}/devices`, "viewer");
    expect(status.body.result).toEqual([
      expect.objectContaining({ deviceId: LED.deviceId, relays: [1, 2, 3], config: expect.objectContaining({ status: "APPLIED" }) }),
    ]);

    const modeRes = await call("post", `/devices/${ledOid}/commands`, "operator", { action: "SET_MODE", mode: "AUTO" });
    expect(modeRes.status).toBe(202);
    await waitFor(async () => (await prisma.deviceStatus.findUnique({ where: { deviceId: LED.deviceId } }))?.mode === "AUTO", 3000, "auto mode");
    const audit = await prisma.auditLog.findFirst({ where: { entity: "Schedule", action: "SCHEDULE_PUBLISHED", entityId: id } });
    expect(audit?.actorEmail).toBe(tokens.operator.email);
  });

  it("a second publish creates config version 2 for the same device", async () => {
    await assign(roomA, [1]);
    const sim = await onlineDevice();
    const { id } = await create("operator");
    await call("post", `/schedules/${id}/publish`, "operator");
    await waitFor(async () => (await latestConfig())?.status === "APPLIED", 4000, "v1 applied");
    await call("put", `/schedules/${id}`, "operator", { rules: [rule("08:00", "20:00")] });
    const res = await call("post", `/schedules/${id}/publish`, "operator");
    expect(res.body.result.configs[0]).toMatchObject({ configVersion: 2, sourceVersions: [{ scheduleId: id, version: 2 }] });
    await waitFor(async () => (await latestConfig())?.status === "APPLIED" && sim.state.config?.config_version === 2, 4000, "v2 applied");
    expect(await prisma.deviceConfig.count({ where: { deviceId: LED.deviceId } })).toBe(2);
  });

  it("a device that rejects the config leaves it REJECTED with the reason; AUTO stays blocked", async () => {
    await assign(roomA, [1]);
    await onlineDevice({ rejectConfig: "NVS_FULL" });
    const { id } = await create("operator");
    await call("post", `/schedules/${id}/publish`, "operator");
    const row = await waitFor(
      async () => {
        const r = await latestConfig();
        return r?.status === "REJECTED" ? r : null;
      },
      4000,
      "rejected",
    );
    expect(row.reason).toBe("NVS_FULL");
    const ready = await call("get", `/devices/${ledOid}/readiness`, "viewer");
    expect(ready.body.result.auto.reasons).toContain("CONFIG_REJECTED");
    const mode = await call("post", `/devices/${ledOid}/commands`, "admin", { action: "SET_MODE", mode: "AUTO" });
    expect(mode.status).toBe(409);
    expect(mode.body.errorCode).toBe("AUTO_NOT_CONFIGURED");
  });

  it("telemetry config_version >= version also marks the config APPLIED", async () => {
    await prisma.deviceConfig.createMany({
      data: [1, 2, 3].map((configVersion) => ({
        deviceId: LED.deviceId,
        configVersion,
        payload: {},
        sourceVersions: [],
        status: "PUBLISHED" as const,
        publishedAt: new Date(),
      })),
    });
    await ConfigService.onTelemetryConfigVersion(LED.deviceId, 2);
    const rows = await prisma.deviceConfig.findMany({ where: { deviceId: LED.deviceId }, orderBy: { configVersion: "asc" } });
    expect(rows.map((r) => r.status)).toEqual(["APPLIED", "APPLIED", "PUBLISHED"]);
    expect(rows[0]?.appliedAt).not.toBeNull();
  });

  it("refuses a config over 4096 bytes with SCHEDULE_TOO_LARGE and publishes nothing", async () => {
    await assign(roomA, Array.from({ length: 16 }, (_, i) => i + 1));
    await onlineDevice();
    const eight = [1, 3, 5, 7, 9, 11, 13, 15].map((h) => rule(`${String(h).padStart(2, "0")}:00`, `${String(h + 1).padStart(2, "0")}:00`));
    const { id } = await create("operator", { rules: eight });
    const res = await call("post", `/schedules/${id}/publish`, "operator");
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe("SCHEDULE_TOO_LARGE");
    expect(res.body.details.max).toBe(MAX_CONFIG_PAYLOAD_BYTES);
    expect(res.body.details.bytes).toBeGreaterThan(MAX_CONFIG_PAYLOAD_BYTES);
    expect(await prisma.deviceConfig.count({})).toBe(0);
    const still = await call("get", `/schedules/${id}`, "viewer");
    expect(still.body.result).toMatchObject({ status: "DRAFT", publishedVersion: null });
    expect(still.body.result.latest.publishedAt).toBeNull();
  });

  it("answers 503 MQTT_UNAVAILABLE when devices need the config but the broker is down", async () => {
    await assign(roomA, [1]);
    const { id } = await create("operator");
    vi.spyOn(MqttClient, "isConnected").mockReturnValue(false);
    const res = await call("post", `/schedules/${id}/publish`, "operator");
    expect(res.status).toBe(503);
    expect(res.body.errorCode).toBe("MQTT_UNAVAILABLE");
    expect((await call("get", `/schedules/${id}`, "viewer")).body.result.status).toBe("DRAFT");
  });

  it("a room without relays can be published; nothing is sent", async () => {
    const { id } = await create("operator");
    const res = await call("post", `/schedules/${id}/publish`, "operator");
    expect(res.status).toBe(200);
    expect(res.body.result.configs).toEqual([]);
    expect(res.body.result.schedule.status).toBe("PUBLISHED");
  });
});

describe("archive and room channel changes re-send the config", () => {
  it("archiving removes the auto block: new config version, AUTO no longer ready; a new schedule can be made", async () => {
    await assign(roomA, [1, 2]);
    await onlineDevice();
    const { id } = await create("operator");
    await call("post", `/schedules/${id}/publish`, "operator");
    await waitFor(async () => (await latestConfig())?.status === "APPLIED", 4000, "v1 applied");

    const res = await call("post", `/schedules/${id}/archive`, "operator");
    expect(res.status).toBe(200);
    expect(res.body.result.schedule.status).toBe("ARCHIVED");
    expect(res.body.result.configs[0]).toMatchObject({ configVersion: 2 });
    const row = await waitFor(
      async () => {
        const r = await latestConfig();
        return r?.configVersion === 2 && r.status === "APPLIED" ? r : null;
      },
      4000,
      "v2 applied",
    );
    expect(configWireSchema.parse(row.payload).auto).toBeNull();
    const ready = await call("get", `/devices/${ledOid}/readiness`, "viewer");
    expect(ready.body.result.auto.reasons).toContain("NO_AUTO_SCHEDULE");

    expect((await call("put", `/schedules/${id}`, "operator", { name: "x" })).body.errorCode).toBe("SCHEDULE_ARCHIVED");
    expect((await call("post", "/schedules", "operator", body({ name: "New one" }))).status).toBe(201);
  });

  it("moving a relay to another room re-sends the device config without that relay", async () => {
    await assign(roomA, [1, 2]);
    await onlineDevice();
    const { id } = await create("operator");
    await call("post", `/schedules/${id}/publish`, "operator");
    await waitFor(async () => (await latestConfig())?.status === "APPLIED", 4000, "v1 applied");

    // admin moves relay 2 out of room A (room B has no schedule)
    const put = await call("put", `/rooms/${roomA}/channels`, "admin", { channels: [{ deviceId: LED.deviceId, relay: 1 }] });
    expect(put.status).toBe(200);
    const row = await waitFor(
      async () => {
        const r = await latestConfig();
        return r?.configVersion === 2 ? r : null;
      },
      4000,
      "v2",
    );
    expect(configWireSchema.parse(row.payload).auto?.channels.map((c) => c.relay)).toEqual([1]);
  });
});
