import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "@/createApp";
import prisma from "@models/prisma.client";
import { LED, startRig, type Rig } from "./rig";
import { mintToken } from "./helpers/tokens";
import { waitFor } from "./helpers/wait";

const API = `/${process.env.MAIN_ROUTE}`;

let rig: Rig;
let app: ReturnType<typeof createApp>;
let ledOid: string;

const tokens = {
  viewer: mintToken("VIEWER"),
  technician: mintToken("TECHNICIAN"),
  operator: mintToken("OPERATOR"),
  admin: mintToken("ADMIN"),
  // has DEVICE_COMMAND but not DEVICE_MODE_SET
  noMode: mintToken("OPERATOR", { permissions: ["DEVICE_READ", "DEVICE_COMMAND"] }),
};

const setMode = (role: keyof typeof tokens, mode: string) =>
  request(app)
    .post(`${API}/devices/${ledOid}/commands`)
    .set("Authorization", `Bearer ${tokens[role].token}`)
    .send({ action: "SET_MODE", mode });

const readiness = (role: keyof typeof tokens = "viewer") =>
  request(app).get(`${API}/devices/${ledOid}/readiness`).set("Authorization", `Bearer ${tokens[role].token}`);

const modeOf = async () =>
  (await prisma.deviceStatus.findUnique({ where: { deviceId: LED.deviceId } }))?.mode;

const iso = (offsetDays: number): string =>
  new Date(Date.now() + 330 * 60_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

const autoPayload = (from: string, to: string | null) => ({
  schema_version: 1,
  device_id: LED.deviceId,
  config_version: 1,
  issued_at_utc: new Date().toISOString(),
  timezone: "Asia/Kolkata",
  tz_offset_minutes: 330,
  auto: { effective_from: from, effective_to: to, channels: [] },
  experiment: null,
});

async function putConfig(status: "PUBLISHED" | "APPLIED" | "REJECTED", payload: object, configVersion = 1) {
  await prisma.deviceConfig.create({
    data: { deviceId: LED.deviceId, configVersion, payload, sourceVersions: [], status, publishedAt: new Date() },
  });
}

async function onlineDevice() {
  // requireConfig false: the simulator accepts AUTO/EXPERIMENT without a config of its own
  const sim = await rig.sim({ requireConfig: false });
  await waitFor(async () => (await rig.status())?.relayStates.length === 16, 5000, "device online");
  return sim;
}

beforeAll(async () => {
  rig = await startRig([LED]);
  app = createApp();
  ledOid = (await prisma.device.findUniqueOrThrow({ where: { deviceId: LED.deviceId } })).id;
});

afterAll(async () => {
  await prisma.deviceConfig.deleteMany({});
  await prisma.experimentAssignment.deleteMany({});
  await prisma.experiment.deleteMany({});
  await prisma.auditLog.deleteMany({ where: { entity: "Command" } });
  await rig.stop();
});

beforeEach(async () => {
  await rig.settle();
  await rig.reset();
  await prisma.deviceConfig.deleteMany({});
  await prisma.experimentAssignment.deleteMany({});
  await prisma.experiment.deleteMany({});
});

describe("SET_MODE", () => {
  it("enters MAINTENANCE and MANUAL; the device reports MODE_CHANGED and the snapshot follows", async () => {
    await onlineDevice();
    const res = await setMode("operator", "MAINTENANCE");
    expect(res.status).toBe(202);
    expect(res.body.result).toMatchObject({ action: "SET_MODE", params: { mode: "MAINTENANCE" }, source: "web" });
    await waitFor(async () => (await modeOf()) === "MAINTENANCE", 3000, "maintenance");
    const ev = await waitFor(
      () => prisma.deviceEvent.findFirst({ where: { deviceId: LED.deviceId, type: "MODE_CHANGED" } }),
      3000,
      "event",
    );
    expect(ev.data).toMatchObject({ mode: "MAINTENANCE", previous: "MANUAL" });
    const audit = await prisma.auditLog.findFirst({
      where: { entity: "Command", action: "COMMAND_SUBMITTED", actorId: tokens.operator.userId },
    });
    expect(audit?.data).toMatchObject({ action: "SET_MODE", params: { mode: "MAINTENANCE" } });

    // Leaving MAINTENANCE takes an explicit SET_MODE; nothing else changes it.
    expect((await setMode("operator", "MANUAL")).status).toBe(202);
    await waitFor(async () => (await modeOf()) === "MANUAL", 3000, "manual");
  });

  it("needs DEVICE_MODE_SET; a viewer cannot send commands at all", async () => {
    await onlineDevice();
    const denied = await setMode("noMode", "MAINTENANCE");
    expect(denied.status).toBe(403);
    expect(denied.body.errorCode).toBe("FORBIDDEN");
    expect((await setMode("viewer", "MAINTENANCE")).status).toBe(403);
    expect(await prisma.command.count({ where: { deviceId: LED.deviceId } })).toBe(0);
  });

  it("rejects an unknown mode (400) and an offline device (409)", async () => {
    const bad = await setMode("admin", "TURBO");
    expect(bad.status).toBe(400);
    expect(bad.body.errorCode).toBe("VALIDATION_FAILED");
    const offline = await setMode("admin", "MAINTENANCE");
    expect(offline.status).toBe(409);
    expect(offline.body.errorCode).toBe("DEVICE_OFFLINE");
  });

  // TODO(owner-decision O-4): TECHNICIAN may only enter/exit MAINTENANCE.
  it("a TECHNICIAN may only enter and leave MAINTENANCE", async () => {
    const sim = await onlineDevice();
    const blocked = await setMode("technician", "AUTO");
    expect(blocked.status).toBe(403);
    expect(blocked.body.errorCode).toBe("FORBIDDEN");
    expect((await setMode("technician", "EXPERIMENT")).status).toBe(403);
    expect((await setMode("technician", "MANUAL")).status).toBe(403); // already MANUAL: not an exit

    expect((await setMode("technician", "MAINTENANCE")).status).toBe(202);
    await waitFor(async () => (await modeOf()) === "MAINTENANCE", 3000, "maintenance");
    expect((await setMode("technician", "AUTO")).status).toBe(403);
    expect((await setMode("technician", "MANUAL")).status).toBe(202);
    await waitFor(async () => (await modeOf()) === "MANUAL", 3000, "manual");
    expect(sim.state.mode).toBe("MANUAL");
  });
});

describe("AUTO readiness", () => {
  it("is refused with AUTO_NOT_CONFIGURED and reasons while no config was applied", async () => {
    await onlineDevice();
    const none = await setMode("admin", "AUTO");
    expect(none.status).toBe(409);
    expect(none.body.errorCode).toBe("AUTO_NOT_CONFIGURED");
    expect(none.body.details.reasons).toEqual(["NO_CONFIG"]);

    await putConfig("PUBLISHED", autoPayload(iso(-1), null));
    const pending = await setMode("admin", "AUTO");
    expect(pending.status).toBe(409);
    expect(pending.body.details.reasons).toEqual(["CONFIG_NOT_APPLIED"]);
  });

  it("covers rejected configs, empty auto blocks and the effective dates (IST)", async () => {
    await onlineDevice();
    await putConfig("REJECTED", autoPayload(iso(-1), null), 1);
    expect((await readiness()).body.result.auto.reasons).toEqual(["CONFIG_REJECTED"]);

    await putConfig("APPLIED", { ...autoPayload(iso(-1), null), auto: null }, 2);
    expect((await readiness()).body.result.auto.reasons).toEqual(["NO_AUTO_SCHEDULE"]);

    await putConfig("APPLIED", autoPayload(iso(1), null), 3);
    expect((await readiness()).body.result.auto.reasons).toEqual(["NOT_YET_EFFECTIVE"]);

    await putConfig("APPLIED", autoPayload(iso(-10), iso(-1)), 4);
    expect((await readiness()).body.result.auto.reasons).toEqual(["EFFECTIVE_PERIOD_ENDED"]);
  });

  it("is accepted with an applied config that covers today, then relay commands are blocked (O-3)", async () => {
    await onlineDevice();
    await putConfig("APPLIED", autoPayload(iso(-1), iso(30)));
    const r = await readiness();
    expect(r.status).toBe(200);
    expect(r.body.result).toMatchObject({
      deviceId: LED.deviceId,
      auto: { ready: true, reasons: [], configVersion: 1, effectiveFrom: iso(-1), effectiveTo: iso(30) },
      experiment: { ready: false, reasons: ["NO_READY_EXPERIMENT"] },
    });

    expect((await setMode("operator", "AUTO")).status).toBe(202);
    await waitFor(async () => (await modeOf()) === "AUTO", 3000, "auto");
    const relay = await request(app)
      .post(`${API}/devices/${ledOid}/commands`)
      .set("Authorization", `Bearer ${tokens.admin.token}`)
      .send({ action: "SET_RELAY", relay: 1, state: "ON" });
    expect(relay.status).toBe(409);
    expect(relay.body.errorCode).toBe("MODE_POLICY_BLOCKED");
  });

  it("is refused when the device reports auto_ready false", async () => {
    await onlineDevice();
    await putConfig("APPLIED", autoPayload(iso(-1), null));
    await prisma.deviceStatus.update({ where: { deviceId: LED.deviceId }, data: { autoReady: false } });
    const res = await setMode("admin", "AUTO");
    expect(res.status).toBe(409);
    expect(res.body.details.reasons).toEqual(["DEVICE_NOT_READY"]);
  });
});

describe("EXPERIMENT readiness", () => {
  async function experiment(status: "DRAFT" | "READY", applied: boolean) {
    const exp = await prisma.experiment.create({
      data: {
        code: "EXP-T1",
        title: "Test experiment",
        status,
        startsAt: new Date(Date.now() - 3600_000),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    await prisma.experimentAssignment.create({
      data: { experimentId: exp.id, groupLabel: "G1", deviceId: LED.deviceId, relay: 1, windows: [] },
    });
    await putConfig(applied ? "APPLIED" : "PUBLISHED", {
      ...autoPayload(iso(-1), null),
      auto: null,
      experiment: {
        experiment_id: exp.id,
        starts_at_utc: exp.startsAt.toISOString(),
        ends_at_utc: exp.endsAt.toISOString(),
        channels: [],
      },
    });
    return exp;
  }

  it("is refused without a READY experiment (EXPERIMENT_NOT_CONFIGURED)", async () => {
    await onlineDevice();
    const none = await setMode("admin", "EXPERIMENT");
    expect(none.status).toBe(409);
    expect(none.body.errorCode).toBe("EXPERIMENT_NOT_CONFIGURED");
    expect(none.body.details.reasons).toEqual(["NO_READY_EXPERIMENT"]);

    await experiment("DRAFT", true);
    expect((await setMode("admin", "EXPERIMENT")).body.errorCode).toBe("EXPERIMENT_NOT_CONFIGURED");
  });

  it("needs the device to have applied the experiment config", async () => {
    await onlineDevice();
    await experiment("READY", false);
    const res = await setMode("admin", "EXPERIMENT");
    expect(res.status).toBe(409);
    expect(res.body.details.reasons).toEqual(["EXPERIMENT_CONFIG_NOT_APPLIED"]);
  });

  it("is accepted for a READY experiment whose config was applied", async () => {
    await onlineDevice();
    const exp = await experiment("READY", true);
    const r = await readiness();
    expect(r.body.result.experiment).toEqual({
      ready: true,
      reasons: [],
      experimentId: exp.id,
      experimentCode: "EXP-T1",
    });
    expect((await setMode("operator", "EXPERIMENT")).status).toBe(202);
    await waitFor(async () => (await modeOf()) === "EXPERIMENT", 3000, "experiment");
  });
});

describe("GET /devices/:id/readiness", () => {
  it("needs DEVICE_READ and a known device", async () => {
    expect((await request(app).get(`${API}/devices/${ledOid}/readiness`)).status).toBe(401);
    const missing = await request(app)
      .get(`${API}/devices/00000000-0000-4000-8000-000000000000/readiness`)
      .set("Authorization", `Bearer ${tokens.viewer.token}`);
    expect(missing.status).toBe(404);
  });
});
