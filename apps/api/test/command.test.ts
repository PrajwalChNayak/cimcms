import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import {
  SOCKET_NAMESPACE,
  SOCKET_PATH,
  type CommandDto,
  type SocketEnvelope,
} from "@cimcms/contracts";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "@/createApp";
import { CommandTimeoutJob } from "@/jobs/commandTimeout.job";
import MqttClient from "@/mqtt/mqtt.client";
import { attachRealtime, closeRealtime } from "@/realtime";
import prisma from "@models/prisma.client";
import CommandService from "@services/command.service";
import { LED, startRig, type Rig } from "./rig";
import { mintToken, type TestRole } from "./helpers/tokens";
import { sleep, waitFor } from "./helpers/wait";

const HUM = { deviceId: "HUM-01", deviceType: "HUMIDIFIER" } as const;
const API = `/${process.env.MAIN_ROUTE}`;

let rig: Rig;
let app: ReturnType<typeof createApp>;
let httpServer: http.Server;
let socket: Socket;
let ledObjectId: string;
let humObjectId: string;
const updates: CommandDto[] = [];

const tokens = {
  viewer: mintToken("VIEWER"),
  technician: mintToken("TECHNICIAN"),
  operator: mintToken("OPERATOR"),
  admin: mintToken("ADMIN"),
};

function submit(
  role: keyof typeof tokens | null,
  body: unknown,
  opts: { id?: string; key?: string; token?: string } = {},
) {
  let req = request(app).post(`${API}/devices/${opts.id ?? ledObjectId}/commands`);
  const token = opts.token ?? (role ? tokens[role].token : undefined);
  if (token) req = req.set("Authorization", `Bearer ${token}`);
  if (opts.key) req = req.set("Idempotency-Key", opts.key);
  return req.send(body as object);
}

const command = (commandId: string) => prisma.command.findUnique({ where: { commandId } });
const result = (res: { body: { result: CommandDto } }): CommandDto => res.body.result;

async function onlineDevice(simOpts: Parameters<Rig["sim"]>[0] = {}) {
  const sim = await rig.sim(simOpts);
  await waitFor(async () => (await rig.status())?.relayStates.length === 16, 5000, "device online");
  return sim;
}

beforeAll(async () => {
  rig = await startRig([LED, HUM]);
  app = createApp();
  ledObjectId = (await prisma.device.findUniqueOrThrow({ where: { deviceId: LED.deviceId } })).id;
  humObjectId = (await prisma.device.findUniqueOrThrow({ where: { deviceId: HUM.deviceId } })).id;

  httpServer = http.createServer();
  attachRealtime(httpServer);
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
  const port = (httpServer.address() as AddressInfo).port;
  socket = connect(`http://127.0.0.1:${port}${SOCKET_NAMESPACE}`, {
    path: SOCKET_PATH,
    transports: ["websocket"],
    auth: { token: tokens.viewer.token },
  });
  await new Promise<void>((r) => socket.once("connect", () => r()));
  socket.on("command:updated", (e: SocketEnvelope<CommandDto>) => updates.push(e.data));
  await new Promise<void>((r) => socket.emit("subscribe:device", { deviceId: LED.deviceId }, () => r()));
});

afterAll(async () => {
  CommandTimeoutJob.stop();
  socket.disconnect();
  await closeRealtime();
  await prisma.auditLog.deleteMany({ where: { entity: "Command" } });
  await rig.stop();
});

beforeEach(async () => {
  await rig.settle();
  await rig.reset();
  updates.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  CommandService.setTiming({ ttlMs: 15_000, graceMs: 5_000 });
  CommandTimeoutJob.stop();
});

describe("POST /devices/:id/commands", () => {
  it("happy path: 202, EXECUTED within 2 s, socket update, relay change attributed to the command, audit row", async () => {
    await onlineDevice();
    const res = await submit("operator", { action: "SET_RELAY", relay: 5, state: "ON" });
    expect(res.status).toBe(202);
    const cmd = result(res);
    expect(["PENDING", "PUBLISHED", "ACCEPTED", "EXECUTED"]).toContain(cmd.status);
    expect(cmd.action).toBe("SET_RELAY");
    expect(cmd.params).toEqual({ relay: 5, state: "ON" });
    expect(cmd.source).toBe("web");
    expect(cmd.issuedBy).toEqual({ id: tokens.operator.userId, email: tokens.operator.email });
    // TTL: expires 15 s after issue
    expect(Date.parse(cmd.expiresAt) - Date.parse(cmd.issuedAt)).toBe(15_000);

    const row = await waitFor(
      async () => {
        const r = await command(cmd.commandId);
        return r?.status === "EXECUTED" ? r : null;
      },
      2000,
      "EXECUTED",
    );
    expect(row.simulation).toBe(true);
    expect(row.completedAt).toBeInstanceOf(Date);
    expect(row.publishedAt).toBeInstanceOf(Date);
    expect(row.acks.map((a) => a.result)).toEqual(["EXECUTED"]);

    await waitFor(() => updates.some((u) => u.commandId === cmd.commandId && u.status === "EXECUTED"), 2000, "socket update");

    // Relay state comes from telemetry; the change is attributed to this command.
    const change = await waitFor(
      async () => prisma.relayStateChange.findFirst({ where: { deviceId: LED.deviceId, relay: 5 } }),
      3000,
      "relay change",
    );
    expect(change).toMatchObject({ state: true, source: "COMMAND", commandId: cmd.commandId });
    await waitFor(async () => (await rig.status())?.relayStates[4], 3000, "snapshot relay 5 on");

    const audit = await prisma.auditLog.findFirst({ where: { action: "COMMAND_SUBMITTED", entityId: cmd.commandId } });
    expect(audit).toMatchObject({ actorId: tokens.operator.userId, actorEmail: tokens.operator.email, actorType: "USER" });
    expect(audit?.data).toMatchObject({ deviceId: LED.deviceId, action: "SET_RELAY", params: { relay: 5, state: "ON" } });

    // reads
    const one = await request(app).get(`${API}/commands/${cmd.commandId}`).set("Authorization", `Bearer ${tokens.viewer.token}`);
    expect(one.status).toBe(200);
    expect(result(one).status).toBe("EXECUTED");
    const missing = await request(app).get(`${API}/commands/${randomUUID()}`).set("Authorization", `Bearer ${tokens.viewer.token}`);
    expect(missing.status).toBe(404);
    expect(missing.body.errorCode).toBe("COMMAND_NOT_FOUND");
  });

  it("lists commands newest first with pagination and a status filter", async () => {
    await onlineDevice();
    const a = result(await submit("operator", { action: "SET_RELAY", relay: 1, state: "ON" }));
    await sleep(5);
    const b = result(await submit("operator", { action: "REQUEST_STATUS" }));
    await waitFor(async () => (await command(b.commandId))?.status === "EXECUTED", 3000, "b done");
    await waitFor(async () => (await command(a.commandId))?.status === "EXECUTED", 3000, "a done");

    const list = await request(app)
      .get(`${API}/devices/${ledObjectId}/commands?limit=1`)
      .set("Authorization", `Bearer ${tokens.viewer.token}`);
    expect(list.status).toBe(200);
    expect(list.body.result.data).toHaveLength(1);
    expect(list.body.result.data[0].commandId).toBe(b.commandId);
    expect(list.body.result.pagination).toMatchObject({ total: 2, page: 1, limit: 1, totalPages: 2 });

    const filtered = await request(app)
      .get(`${API}/devices/${ledObjectId}/commands?status=FAILED`)
      .set("Authorization", `Bearer ${tokens.viewer.token}`);
    expect(filtered.body.result.data).toHaveLength(0);
    const bad = await request(app)
      .get(`${API}/devices/${ledObjectId}/commands?status=NOPE`)
      .set("Authorization", `Bearer ${tokens.viewer.token}`);
    expect(bad.status).toBe(400);
  });

  it("rejects missing auth (401) and a VIEWER (403)", async () => {
    await onlineDevice();
    expect((await submit(null, { action: "REQUEST_STATUS" })).status).toBe(401);
    const res = await submit("viewer", { action: "SET_RELAY", relay: 1, state: "ON" });
    expect(res.status).toBe(403);
    expect(await prisma.command.count({ where: { deviceId: LED.deviceId } })).toBe(0);
  });

  it("validates body, params and header; unknown device is 404; humidifier supports no action", async () => {
    await onlineDevice();
    for (const body of [
      { action: "SET_RELAY", relay: 17, state: "ON" },
      { action: "SET_RELAY", relay: 0, state: "ON" },
      { action: "SET_RELAY", relay: 1, state: "TOGGLE" },
      { action: "SET_MODE", mode: "TURBO" },
      { action: "SET_MODE" },
      { action: "RTC_SYNC_NOW" }, // only through POST /devices/:id/rtc-sync (T5.5)
      { action: "NOPE" },
      {},
    ]) {
      const res = await submit("operator", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.errorCode).toBe("VALIDATION_FAILED");
    }
    expect((await submit("operator", { action: "REQUEST_STATUS" }, { id: "not-an-id" })).status).toBe(400);
    expect(
      (await submit("operator", { action: "REQUEST_STATUS" }, { key: "not-a-uuid" })).body.errorCode,
    ).toBe("VALIDATION_FAILED");

    const unknown = await submit("operator", { action: "REQUEST_STATUS" }, { id: "a".repeat(24) });
    expect(unknown.status).toBe(404);
    expect(unknown.body.errorCode).toBe("DEVICE_NOT_FOUND");

    const hum = await submit("operator", { action: "REQUEST_STATUS" }, { id: humObjectId });
    expect(hum.status).toBe(400);
    expect(hum.body.errorCode).toBe("ACTION_NOT_SUPPORTED");
    expect(await prisma.command.count()).toBe(0);
  });

  it("device never seen or offline -> 409 DEVICE_OFFLINE; stale/unknown -> 409 DEVICE_STALE", async () => {
    // no status yet
    let res = await submit("operator", { action: "REQUEST_STATUS" });
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe("DEVICE_OFFLINE");

    const sim = await onlineDevice();
    await sim.crash();
    await waitFor(async () => (await rig.status())?.liveness === "OFFLINE", 5000, "offline");
    res = await submit("operator", { action: "SET_RELAY", relay: 1, state: "ON" });
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe("DEVICE_OFFLINE");

    for (const liveness of ["STALE", "UNKNOWN"] as const) {
      await prisma.deviceStatus.update({ where: { deviceId: LED.deviceId }, data: { liveness } });
      res = await submit("operator", { action: "REQUEST_STATUS" });
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe("DEVICE_STALE");
    }
    expect(await prisma.command.count({ where: { deviceId: LED.deviceId } })).toBe(0);
  });

  it("mode policy: AUTO is blocked, MAINTENANCE needs DEVICE_DIAGNOSTICS", async () => {
    const sim = await onlineDevice();
    await sim.setMode("MAINTENANCE");
    await waitFor(async () => (await prisma.deviceStatus.findUnique({ where: { deviceId: LED.deviceId } }))?.mode === "MAINTENANCE", 3000, "maintenance");

    const blocked = await submit("operator", { action: "SET_RELAY", relay: 2, state: "ON" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.errorCode).toBe("MODE_POLICY_BLOCKED");
    const ok = await submit("technician", { action: "SET_RELAY", relay: 2, state: "ON" });
    expect(ok.status).toBe(202);
    await waitFor(async () => (await command(result(ok).commandId))?.status === "EXECUTED", 3000, "executed");

    await sim.setMode("AUTO");
    await waitFor(async () => (await prisma.deviceStatus.findUnique({ where: { deviceId: LED.deviceId } }))?.mode === "AUTO", 3000, "auto");
    for (const role of ["admin", "technician"] as const) {
      const res = await submit(role, { action: "SET_RELAY", relay: 2, state: "OFF" });
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe("MODE_POLICY_BLOCKED");
    }
    const bulk = await submit("admin", { action: "SET_ALL_RELAYS", state: "OFF" });
    expect(bulk.body.errorCode).toBe("MODE_POLICY_BLOCKED");
    // REQUEST_STATUS is not a relay command: allowed in any mode
    expect((await submit("technician", { action: "REQUEST_STATUS" })).status).toBe(202);
  });

  it("SET_ALL_RELAYS needs DEVICE_COMMAND_BULK: TECHNICIAN 403, OPERATOR 202 and all 16 relays switch", async () => {
    await onlineDevice();
    const denied = await submit("technician", { action: "SET_ALL_RELAYS", state: "ON" });
    expect(denied.status).toBe(403);
    expect(denied.body.errorCode).toBe("FORBIDDEN");
    expect(await prisma.command.count({ where: { deviceId: LED.deviceId } })).toBe(0);

    const res = await submit("operator", { action: "SET_ALL_RELAYS", state: "ON" });
    expect(res.status).toBe(202);
    await waitFor(async () => (await rig.status())?.relayStates.every(Boolean), 3000, "all on");
    await waitFor(async () => (await command(result(res).commandId))?.status === "EXECUTED", 3000, "executed");
  });

  it("a device that rejects the command ends REJECTED with the reason", async () => {
    await onlineDevice({ rejectAll: "INVALID_RELAY" });
    const res = await submit("operator", { action: "SET_RELAY", relay: 1, state: "ON" });
    const row = await waitFor(
      async () => {
        const r = await command(result(res).commandId);
        return r?.status === "REJECTED" ? r : null;
      },
      3000,
      "REJECTED",
    );
    expect(row.reason).toBe("INVALID_RELAY");
    await waitFor(() => updates.some((u) => u.status === "REJECTED" && u.reason === "INVALID_RELAY"), 2000, "socket");
  });

  it("a device that ignores the command ends TIMEOUT after expiry + grace (short TTL via test config)", async () => {
    CommandService.setTiming({ ttlMs: 1000, graceMs: 500 });
    CommandTimeoutJob.start({ intervalMs: 100, startDelayMs: 0 });
    await onlineDevice({ ignoreCommands: true });
    const t0 = Date.now();
    const res = await submit("operator", { action: "SET_RELAY", relay: 1, state: "ON" });
    expect(res.status).toBe(202);
    const row = await waitFor(
      async () => {
        const r = await command(result(res).commandId);
        return r?.status === "TIMEOUT" ? r : null;
      },
      6000,
      "TIMEOUT",
    );
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(1400); // not before expiry + grace
    expect(row.completedAt).toBeInstanceOf(Date);
    await waitFor(() => updates.some((u) => u.status === "TIMEOUT"), 2000, "socket TIMEOUT");
    // the UI-visible relay state did not change
    expect((await rig.status())?.relayStates[0]).toBe(false);
  });

  it("a late ack after TIMEOUT keeps TIMEOUT and sets lateResult", async () => {
    CommandService.setTiming({ ttlMs: 1000, graceMs: 300 });
    CommandTimeoutJob.start({ intervalMs: 100, startDelayMs: 0 });
    await onlineDevice({ latencyMs: 2500 });
    const res = await submit("operator", { action: "SET_RELAY", relay: 3, state: "ON" });
    const id = result(res).commandId;
    await waitFor(async () => (await command(id))?.status === "TIMEOUT", 5000, "TIMEOUT");
    const late = await waitFor(
      async () => {
        const r = await command(id);
        return r?.lateResult ? r : null;
      },
      6000,
      "lateResult",
    );
    expect(late.status).toBe("TIMEOUT");
    expect(late.lateResult).toBe("EXECUTED");
    expect(late.acks.map((a) => a.result)).toEqual(["EXECUTED"]);
  });

  it("an ack that arrives before the PUBLISHED update still ends EXECUTED", async () => {
    await onlineDevice();
    const original = MqttClient.publish.bind(MqttClient);
    vi.spyOn(MqttClient, "publish").mockImplementation(async (topic, payload, opts) => {
      await original(topic, payload, opts);
      await sleep(600); // the simulator (latency 0) answers during this gap
    });
    const res = await submit("operator", { action: "SET_RELAY", relay: 7, state: "ON" });
    expect(res.status).toBe(202);
    const row = await command(result(res).commandId);
    expect(row?.status).toBe("EXECUTED");
    expect(row?.acks).toHaveLength(1);
    // PENDING -> PUBLISHED lost the race, so publishedAt was never set
    expect(row?.publishedAt).toBeNull();
  });

  it("same Idempotency-Key twice gives one command; another user gets 409", async () => {
    await onlineDevice();
    const key = randomUUID();
    const first = await submit("operator", { action: "SET_RELAY", relay: 1, state: "ON" }, { key });
    const second = await submit("operator", { action: "SET_RELAY", relay: 1, state: "ON" }, { key });
    expect(first.status).toBe(202);
    expect(second.status).toBe(200);
    expect(result(second).commandId).toBe(result(first).commandId);
    expect(await prisma.command.count({ where: { deviceId: LED.deviceId } })).toBe(1);

    const other = await submit("admin", { action: "SET_RELAY", relay: 1, state: "ON" }, { key });
    expect(other.status).toBe(409);
    expect(other.body.errorCode).toBe("IDEMPOTENCY_CONFLICT");

    // simultaneous requests with one key still create one command
    const key2 = randomUUID();
    const [x, y] = await Promise.all([
      submit("operator", { action: "REQUEST_STATUS" }, { key: key2 }),
      submit("operator", { action: "REQUEST_STATUS" }, { key: key2 }),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 202]);
    expect(await prisma.command.count({ where: { idempotencyKey: key2 } })).toBe(1);
  });

  it("refuses the 5th in-flight command with 429 DEVICE_BUSY", async () => {
    await onlineDevice({ ignoreCommands: true });
    for (let i = 1; i <= 4; i++) {
      const res = await submit("operator", { action: "SET_RELAY", relay: i, state: "ON" });
      expect(res.status).toBe(202);
    }
    const res = await submit("operator", { action: "SET_RELAY", relay: 5, state: "ON" });
    expect(res.status).toBe(429);
    expect(res.body.errorCode).toBe("DEVICE_BUSY");
    expect(await prisma.command.count({ where: { deviceId: LED.deviceId } })).toBe(4);
  });

  it("a publish error ends PUBLISH_FAILED", async () => {
    await onlineDevice();
    vi.spyOn(MqttClient, "publish").mockRejectedValue(new Error("broker said no"));
    const res = await submit("operator", { action: "SET_RELAY", relay: 1, state: "ON" });
    expect(res.status).toBe(202);
    expect(result(res).status).toBe("PUBLISH_FAILED");
    expect(result(res).completedAt).not.toBeNull();
  });

  it("timeout sweep waits for the start delay after the MQTT connect", async () => {
    const now = new Date();
    await prisma.command.create({
      data: {
        commandId: randomUUID(),
        idempotencyKey: randomUUID(),
        deviceId: LED.deviceId,
        action: "REQUEST_STATUS",
        params: {},
        source: "web",
        status: "PUBLISHED",
        issuedAt: new Date(now.getTime() - 60_000),
        expiresAt: new Date(now.getTime() - 45_000),
      },
    });
    CommandTimeoutJob.start({ intervalMs: 3_600_000, startDelayMs: 60_000 });
    expect(await CommandTimeoutJob.runOnce()).toBe(0);
    CommandTimeoutJob.stop();
    CommandTimeoutJob.start({ intervalMs: 3_600_000, startDelayMs: 0 });
    expect(await CommandTimeoutJob.runOnce()).toBe(1);
    expect(await CommandTimeoutJob.runOnce()).toBe(0); // already terminal
  });

  it("answers 503 MQTT_UNAVAILABLE when the broker connection is down", async () => {
    await onlineDevice();
    await MqttClient.shutdown();
    const res = await submit("operator", { action: "SET_RELAY", relay: 1, state: "ON" });
    expect(res.status).toBe(503);
    expect(res.body.errorCode).toBe("MQTT_UNAVAILABLE");
    expect(await prisma.command.count({ where: { deviceId: LED.deviceId } })).toBe(0);
  });
});

// keep TestRole referenced for type completeness of the helper import
export type { TestRole };
