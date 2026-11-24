import { configWireSchema, topicFor } from "@cimcms/contracts";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "@/createApp";
import { ExperimentJob } from "@/jobs/experiment.job";
import MqttClient from "@/mqtt/mqtt.client";
import prisma from "@models/prisma.client";
import ExperimentService from "@services/experiment.service";
import { LED, startRig, type Rig } from "./rig";
import { mintToken } from "./helpers/tokens";
import { waitFor } from "./helpers/wait";

const API = `/${process.env.MAIN_ROUTE}`;
const ALL = [1, 2, 3, 4, 5, 6, 7];
/** Covers the whole day without overlap: 00:00-12:00 and 12:00-00:00 (next day). */
const ALL_DAY = [
  { days: ALL, on: "00:00", off: "12:00" },
  { days: ALL, on: "12:00", off: "00:00" },
];

let rig: Rig;
let app: ReturnType<typeof createApp>;
let ledOid: string;

const tokens = {
  viewer: mintToken("VIEWER"),
  technician: mintToken("TECHNICIAN"),
  operator: mintToken("OPERATOR"),
  admin: mintToken("ADMIN"),
  writeOnly: mintToken("OPERATOR", { permissions: ["DEVICE_READ", "EXPERIMENT_READ", "EXPERIMENT_WRITE"] }),
};
type Who = keyof typeof tokens;

const call = (method: "get" | "post" | "put", path: string, who: Who | null, body?: object) => {
  let req = request(app)[method](`${API}${path}`);
  if (who) req = req.set("Authorization", `Bearer ${tokens[who].token}`);
  return body ? req.send(body) : who && method !== "get" ? req.send({}) : req;
};

const body = (over: Record<string, unknown> = {}) => ({
  code: "EXP-1",
  title: "Light spectrum trial",
  startsAt: new Date(Date.now() - 3600_000).toISOString(),
  endsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  assignments: [
    { groupLabel: "Control", deviceId: LED.deviceId, relay: 3, windows: ALL_DAY },
    { groupLabel: "Blue", deviceId: LED.deviceId, relay: 4, windows: [{ days: ALL, on: "06:00", off: "18:00" }] },
  ],
  ...over,
});

async function create(who: Who = "operator", over: Record<string, unknown> = {}) {
  const res = await call("post", "/experiments", who, body(over));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.result as { id: string };
}

async function onlineDevice(opts: Parameters<Rig["sim"]>[0] = {}) {
  const sim = await rig.sim({ executorIntervalMs: 0, ...opts });
  await waitFor(async () => (await rig.status())?.relayStates.length === 16, 5000, "device online");
  return sim;
}

const latestConfig = () =>
  prisma.deviceConfig.findFirst({ where: { deviceId: LED.deviceId }, orderBy: { configVersion: "desc" } });
const modeOf = async () => (await prisma.deviceStatus.findUnique({ where: { deviceId: LED.deviceId } }))?.mode;
const statusOf = async (id: string) => (await prisma.experiment.findUniqueOrThrow({ where: { id } })).status;

async function wipe(): Promise<void> {
  await prisma.deviceConfig.deleteMany({});
  await prisma.experimentAssignment.deleteMany({});
  await prisma.experiment.deleteMany({});
}

/** DRAFT -> READY and wait until the device confirmed the config. */
async function makeReady(id: string) {
  const res = await call("post", `/experiments/${id}/ready`, "operator");
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  await waitFor(async () => (await latestConfig())?.status === "APPLIED", 4000, "config applied");
  return res;
}

beforeAll(async () => {
  rig = await startRig([LED]);
  app = createApp();
  ledOid = (await prisma.device.findUniqueOrThrow({ where: { deviceId: LED.deviceId } })).id;
});

afterAll(async () => {
  await wipe();
  await prisma.auditLog.deleteMany({ where: { entity: { in: ["Experiment", "DeviceConfig", "Command"] } } });
  await rig.stop();
});

beforeEach(async () => {
  await rig.settle();
  await rig.reset();
  await wipe();
  await prisma.auditLog.deleteMany({ where: { entity: "Experiment" } });
  await MqttClient.publish(topicFor("LED_CONTROLLER", LED.deviceId, "config"), "", { qos: 1, retain: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("experiment CRUD and validation", () => {
  it("permissions: viewer reads, technician cannot write or run, run needs EXPERIMENT_RUN", async () => {
    const { id } = await create("operator");
    expect((await call("get", "/experiments", null)).status).toBe(401);
    expect((await call("get", "/experiments", "viewer")).status).toBe(200);
    expect((await call("get", `/experiments/${id}`, "technician")).status).toBe(200);
    expect((await call("post", "/experiments", "technician", body({ code: "X" }))).status).toBe(403);
    expect((await call("put", `/experiments/${id}`, "viewer", { title: "x" })).status).toBe(403);
    for (const action of ["start", "pause", "resume", "stop"]) {
      const res = await call("post", `/experiments/${id}/${action}`, "writeOnly");
      expect(res.status, action).toBe(403);
      expect(res.body.errorCode).toBe("FORBIDDEN");
    }
    expect((await call("post", `/experiments/${id}/ready`, "technician")).status).toBe(403);
  });

  it("creates a draft with its assignments and fetches / lists it", async () => {
    const { id } = await create("operator");
    const got = await call("get", `/experiments/${id}`, "viewer");
    expect(got.body.result).toMatchObject({
      code: "EXP-1",
      title: "Light spectrum trial",
      status: "DRAFT",
      createdByEmail: tokens.operator.email,
    });
    expect(got.body.result.assignments).toEqual([
      { groupLabel: "Blue", deviceId: LED.deviceId, relay: 4, windows: [{ days: ALL, on: "06:00", off: "18:00" }] },
      { groupLabel: "Control", deviceId: LED.deviceId, relay: 3, windows: ALL_DAY },
    ]);
    expect((await call("get", "/experiments?status=DRAFT", "viewer")).body.result.data).toHaveLength(1);
    expect((await call("get", "/experiments?status=RUNNING", "viewer")).body.result.data).toHaveLength(0);
    const audit = await prisma.auditLog.findFirst({ where: { entity: "Experiment", entityId: id } });
    expect(audit).toMatchObject({ action: "EXPERIMENT_CREATED", actorEmail: tokens.operator.email });
    expect((await call("get", "/experiments/00000000-0000-4000-8000-000000000000", "viewer")).body.errorCode).toBe("EXPERIMENT_NOT_FOUND");
  });

  it("validates code, dates, relays, windows and devices", async () => {
    await create("operator");
    const bad = async (over: Record<string, unknown>) => call("post", "/experiments", "operator", body({ code: "EXP-2", ...over }));
    expect((await bad({ code: "EXP-1" })).body.errorCode).toBe("EXPERIMENT_CODE_TAKEN");
    expect((await bad({ code: "bad code" })).body.errorCode).toBe("VALIDATION_FAILED");
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect((await bad({ endsAt: past })).body.errorCode).toBe("VALIDATION_FAILED");
    expect((await bad({ startsAt: new Date(Date.now() + 9 * 86_400_000).toISOString() })).status).toBe(400);
    expect((await bad({ assignments: [] })).status).toBe(400);
    expect((await bad({ assignments: [{ groupLabel: "G", deviceId: LED.deviceId, relay: 17, windows: ALL_DAY }] })).status).toBe(400);
    const twice = await bad({
      assignments: [
        { groupLabel: "A", deviceId: LED.deviceId, relay: 1, windows: ALL_DAY },
        { groupLabel: "B", deviceId: LED.deviceId, relay: 1, windows: ALL_DAY },
      ],
    });
    expect(twice.status).toBe(400);
    expect(twice.body.errorCode).toBe("VALIDATION_FAILED");
    const overlap = await bad({
      assignments: [
        { groupLabel: "A", deviceId: LED.deviceId, relay: 1, windows: [{ days: ALL, on: "06:00", off: "12:00" }, { days: [2], on: "11:00", off: "14:00" }] },
      ],
    });
    expect(overlap.status).toBe(400);
    expect(overlap.body.errorCode).toBe("SCHEDULE_OVERLAP");
    expect(overlap.body.details).toMatchObject({ scope: "EXPERIMENT", relay: 1 });
    const unknown = await bad({ assignments: [{ groupLabel: "A", deviceId: "LED-NOPE", relay: 1, windows: ALL_DAY }] });
    expect(unknown.status).toBe(404);
    expect(unknown.body.errorCode).toBe("DEVICE_NOT_FOUND");
  });

  it("only a DRAFT can be edited", async () => {
    const { id } = await create("operator");
    const ok = await call("put", `/experiments/${id}`, "operator", {
      title: "Renamed",
      assignments: [{ groupLabel: "Only", deviceId: LED.deviceId, relay: 9, windows: ALL_DAY }],
    });
    expect(ok.status).toBe(200);
    expect(ok.body.result.title).toBe("Renamed");
    expect(ok.body.result.assignments).toHaveLength(1);
    expect((await call("put", `/experiments/${id}`, "operator", {})).status).toBe(400);

    await onlineDevice();
    await makeReady(id);
    const locked = await call("put", `/experiments/${id}`, "operator", { title: "No" });
    expect(locked.status).toBe(409);
    expect(locked.body.errorCode).toBe("EXPERIMENT_INVALID_STATE");
  });
});

describe("ready", () => {
  it("sends a retained config with the experiment block; the device applies it; AUTO and EXPERIMENT readiness follow", async () => {
    const sim = await onlineDevice();
    const { id } = await create("operator");
    const res = await call("post", `/experiments/${id}/ready`, "operator");
    expect(res.status).toBe(200);
    expect(res.body.result.experiment.status).toBe("READY");
    expect(res.body.result.configs).toHaveLength(1);
    expect(res.body.result.warnings).toEqual([]);

    const row = await waitFor(
      async () => {
        const r = await latestConfig();
        return r?.status === "APPLIED" ? r : null;
      },
      4000,
      "applied",
    );
    const wire = configWireSchema.parse(row.payload);
    expect(wire.auto).toBeNull();
    expect(wire.experiment).toMatchObject({ experiment_id: id });
    expect(wire.experiment?.channels.map((c) => c.relay)).toEqual([3, 4]);
    expect(sim.state.config?.experiment?.experiment_id).toBe(id);

    const ready = await call("get", `/devices/${ledOid}/readiness`, "viewer");
    expect(ready.body.result.experiment).toMatchObject({ ready: true, experimentId: id, experimentCode: "EXP-1" });

    const devices = await call("get", `/experiments/${id}/devices`, "viewer");
    expect(devices.body.result).toEqual([
      expect.objectContaining({ deviceId: LED.deviceId, relays: [3, 4], liveness: "ONLINE", carriesExperiment: true }),
    ]);
    expect(rig.emits.some((e) => e.event === "experiment:updated")).toBe(true);
    expect(await prisma.auditLog.count({ where: { entity: "Experiment", entityId: id, action: "EXPERIMENT_READY" } })).toBe(1);
  });

  it("is refused while the broker is down, for a past period and when the device is used by another experiment", async () => {
    const { id } = await create("operator");
    vi.spyOn(MqttClient, "isConnected").mockReturnValue(false);
    expect((await call("post", `/experiments/${id}/ready`, "operator")).body.errorCode).toBe("MQTT_UNAVAILABLE");
    expect(await statusOf(id)).toBe("DRAFT");
    vi.restoreAllMocks();

    await onlineDevice();
    await makeReady(id);
    const other = await create("operator", { code: "EXP-2" });
    const conflict = await call("post", `/experiments/${other.id}/ready`, "operator");
    expect(conflict.status).toBe(409);
    expect(conflict.body.errorCode).toBe("EXPERIMENT_CONFLICT");
    expect(conflict.body.details).toMatchObject({ experiments: ["EXP-1"], devices: [LED.deviceId] });
    expect(await statusOf(other.id)).toBe("DRAFT");
  });

  it("revert goes back to DRAFT and the device loses the experiment block", async () => {
    await onlineDevice();
    const { id } = await create("operator");
    await makeReady(id);
    const res = await call("post", `/experiments/${id}/revert`, "operator");
    expect(res.status).toBe(200);
    expect(res.body.result.experiment.status).toBe("DRAFT");
    const row = await waitFor(
      async () => {
        const r = await latestConfig();
        return r?.configVersion === 2 && r.status === "APPLIED" ? r : null;
      },
      4000,
      "v2",
    );
    expect(configWireSchema.parse(row.payload).experiment).toBeNull();
    expect((await call("post", `/experiments/${id}/revert`, "operator")).body.errorCode).toBe("EXPERIMENT_INVALID_STATE");
  });
});

describe("start, pause, resume, stop", () => {
  it("full lifecycle: RUNNING switches the device to EXPERIMENT (others OFF), pause = MAINTENANCE, resume, stop = MANUAL and the block is removed", async () => {
    const sim = await onlineDevice();
    await sim.setAll(true); // every relay ON by keypad (MANUAL)
    const { id } = await create("operator");
    await makeReady(id);

    const start = await call("post", `/experiments/${id}/start`, "operator");
    expect(start.status, JSON.stringify(start.body)).toBe(200);
    expect(start.body.result.experiment.status).toBe("RUNNING");
    expect(start.body.result.commandIds).toHaveLength(1);
    const cmd = await prisma.command.findFirstOrThrow({ where: { commandId: start.body.result.commandIds[0] } });
    expect(cmd).toMatchObject({ action: "SET_MODE", source: "experiment", issuedByEmail: tokens.operator.email });
    expect(cmd.params).toEqual({ mode: "EXPERIMENT" });
    await waitFor(async () => (await prisma.command.findUnique({ where: { id: cmd.id } }))?.status === "EXECUTED", 3000, "executed");
    await waitFor(async () => (await modeOf()) === "EXPERIMENT", 3000, "mode");

    // O-15 default: relays that are not part of the experiment are OFF; relay 3 runs all day, relay 4 only 06-18 IST.
    expect(sim.state.relays[2]).toBe(true);
    expect(sim.state.relays.filter(Boolean).length).toBeLessThanOrEqual(2);
    expect(sim.state.relays.slice(4).some(Boolean)).toBe(false);
    await waitFor(async () => (await rig.status())?.relayStates[0] === false, 3000, "relay 1 off");
    expect(
      await prisma.relayStateChange.count({ where: { deviceId: LED.deviceId, source: "EXPERIMENT" } }),
    ).toBeGreaterThan(0);

    // Manual relay commands stay blocked while it runs (O-3).
    const blocked = await call("post", `/devices/${ledOid}/commands`, "admin", { action: "SET_RELAY", relay: 1, state: "ON" });
    expect(blocked.body.errorCode).toBe("MODE_POLICY_BLOCKED");
    expect((await call("post", `/experiments/${id}/start`, "operator")).body.errorCode).toBe("EXPERIMENT_INVALID_STATE");
    expect((await call("post", `/experiments/${id}/resume`, "operator")).body.errorCode).toBe("EXPERIMENT_INVALID_STATE");

    // pause
    const pause = await call("post", `/experiments/${id}/pause`, "operator");
    expect(pause.body.result.experiment.status).toBe("PAUSED");
    await waitFor(async () => (await modeOf()) === "MAINTENANCE", 3000, "maintenance");
    // resume
    const resume = await call("post", `/experiments/${id}/resume`, "operator");
    expect(resume.body.result.experiment.status).toBe("RUNNING");
    await waitFor(async () => (await modeOf()) === "EXPERIMENT", 3000, "experiment again");

    // stop
    const stop = await call("post", `/experiments/${id}/stop`, "operator");
    expect(stop.status).toBe(200);
    expect(stop.body.result.experiment.status).toBe("STOPPED");
    expect(stop.body.result.warnings).toEqual([]);
    await waitFor(async () => (await modeOf()) === "MANUAL", 3000, "manual");
    const row = await waitFor(
      async () => {
        const r = await latestConfig();
        return r?.configVersion === 2 && r.status === "APPLIED" ? r : null;
      },
      4000,
      "config without experiment",
    );
    expect(configWireSchema.parse(row.payload).experiment).toBeNull();
    const ready = await call("get", `/devices/${ledOid}/readiness`, "viewer");
    expect(ready.body.result.experiment.reasons).toEqual(["NO_READY_EXPERIMENT"]);
    expect((await call("post", `/experiments/${id}/stop`, "operator")).body.errorCode).toBe("EXPERIMENT_INVALID_STATE");

    // audit trail and event log
    const actions = (await prisma.auditLog.findMany({ where: { entity: "Experiment", entityId: id } })).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "EXPERIMENT_CREATED",
        "EXPERIMENT_READY",
        "EXPERIMENT_STARTED",
        "EXPERIMENT_PAUSED",
        "EXPERIMENT_RESUMED",
        "EXPERIMENT_STOPPED",
      ]),
    );
    const log = await call("get", `/experiments/${id}/events`, "viewer");
    expect(log.status).toBe(200);
    const types = log.body.result.map((e: { type: string }) => e.type);
    expect(types).toEqual(expect.arrayContaining(["EXPERIMENT_STARTED", "MODE_CHANGED", "CONFIG_APPLIED"]));
  });

  it("start needs every device to have applied the config and to be online", async () => {
    await onlineDevice({ rejectConfig: "NVS_FULL" });
    const { id } = await create("operator");
    await call("post", `/experiments/${id}/ready`, "operator");
    await waitFor(async () => (await latestConfig())?.status === "REJECTED", 4000, "rejected");
    const res = await call("post", `/experiments/${id}/start`, "operator");
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe("EXPERIMENT_NOT_CONFIGURED");
    expect(res.body.details.devices).toEqual([
      { deviceId: LED.deviceId, reasons: ["EXPERIMENT_CONFIG_NOT_APPLIED"] },
    ]);
    expect(await statusOf(id)).toBe("READY");
    expect(await prisma.command.count({ where: { deviceId: LED.deviceId, action: "SET_MODE" } })).toBe(0);

    // the experiment can be sent again and stopped
    expect((await call("post", `/experiments/${id}/resend`, "operator")).status).toBe(200);
    expect((await call("post", `/experiments/${id}/stop`, "operator")).body.result.experiment.status).toBe("STOPPED");
  });

  it("start is refused for an offline device", async () => {
    await onlineDevice();
    const { id } = await create("operator");
    await makeReady(id);
    await rig.settle(); // device gone
    const res = await call("post", `/experiments/${id}/start`, "operator");
    expect(res.status).toBe(409);
    expect(res.body.details.devices[0].reasons).toContain("DEVICE_OFFLINE");
    expect(await statusOf(id)).toBe("READY");
  });

  it("the sweeper completes an experiment whose period is over: device back to MANUAL, block removed", async () => {
    await onlineDevice();
    const { id } = await create("operator");
    await makeReady(id);
    expect((await call("post", `/experiments/${id}/start`, "operator")).status).toBe(200);
    await waitFor(async () => (await modeOf()) === "EXPERIMENT", 3000, "experiment mode");

    expect(await ExperimentJob.runOnce(new Date())).toBe(0); // not due yet
    const future = new Date(Date.now() + 30 * 86_400_000);
    expect(await ExperimentJob.runOnce(future)).toBe(1);
    expect(await statusOf(id)).toBe("COMPLETED");
    await waitFor(async () => (await modeOf()) === "MANUAL", 3000, "manual");
    await waitFor(async () => (await latestConfig())?.configVersion === 2, 4000, "config v2");
    expect(await prisma.auditLog.count({ where: { entity: "Experiment", entityId: id, action: "EXPERIMENT_COMPLETED" } })).toBe(1);
  });

  it("stopping a READY experiment sends no mode command but removes the block", async () => {
    await onlineDevice();
    const { id } = await create("operator");
    await makeReady(id);
    const res = await call("post", `/experiments/${id}/stop`, "operator");
    expect(res.body.result.experiment.status).toBe("STOPPED");
    expect(res.body.result.commandIds).toEqual([]);
    expect(await prisma.command.count({ where: { deviceId: LED.deviceId, action: "SET_MODE" } })).toBe(0);
    await waitFor(async () => (await latestConfig())?.configVersion === 2, 4000, "config v2");
  });
});

describe("mode reconciliation (device offline at stop)", () => {
  it("puts a device left in EXPERIMENT mode back to MANUAL once it is online and no experiment owns it", async () => {
    const later = () => new Date(Date.now() + 60_000); // past the quiet period after the last SET_MODE
    const sim = await onlineDevice();
    const { id } = await create("operator");
    await makeReady(id);
    expect((await call("post", `/experiments/${id}/start`, "operator")).status).toBe(200);
    await waitFor(async () => (await modeOf()) === "EXPERIMENT", 3000, "experiment mode");

    // A RUNNING experiment owns the device: nothing to do.
    expect(await ExperimentService.reconcileModes(later())).toEqual([]);

    // The device drops off, then the experiment is stopped: its MANUAL command cannot be sent.
    await sim.crash();
    await waitFor(async () => (await rig.status())?.liveness === "OFFLINE", 3000, "offline");
    const stop = await call("post", `/experiments/${id}/stop`, "operator");
    expect(stop.body.result.experiment.status).toBe("STOPPED");
    expect(stop.body.result.warnings.map((w: { code: string }) => w.code)).toContain("DEVICE_OFFLINE");

    // It comes back still in EXPERIMENT mode.
    await rig.sim({ executorIntervalMs: 0, mode: "EXPERIMENT", requireConfig: false });
    await waitFor(
      async () => {
        const st = await rig.status();
        return st?.liveness === "ONLINE" && (await modeOf()) === "EXPERIMENT";
      },
      5000,
      "back online in EXPERIMENT",
    );

    expect(await ExperimentService.reconcileModes(later())).toEqual([LED.deviceId]);
    await waitFor(async () => (await modeOf()) === "MANUAL", 3000, "manual again");
    const cmd = await prisma.command.findFirstOrThrow({
      where: { deviceId: LED.deviceId, source: "system", action: "SET_MODE" },
      orderBy: { issuedAt: "desc" },
    });
    expect(cmd.params).toEqual({ mode: "MANUAL" });
    expect(await prisma.auditLog.count({ where: { action: "EXPERIMENT_MODE_RECONCILED", entityId: cmd.commandId } })).toBe(1);

    // Nothing left to fix.
    expect(await ExperimentService.reconcileModes(later())).toEqual([]);
  });
});
