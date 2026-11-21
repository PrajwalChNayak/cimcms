import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "@/createApp";
import { LivenessJob } from "@/jobs/liveness.job";
import { RETENTION_DAYS, RetentionJob } from "@/jobs/retention.job";
import { startJobs, stopJobs } from "@/jobs";
import MqttClient from "@/mqtt/mqtt.client";
import { RealtimeEmitter } from "@/realtime/realtime.emitter";
import prisma from "@models/prisma.client";
import { LED, startRig, type Rig } from "./rig";
import { waitFor } from "./helpers/wait";

const HUM = { deviceId: "HUM-01", deviceType: "HUMIDIFIER" } as const;
const DAY = 24 * 3600_000;

let rig: Rig;
let app: ReturnType<typeof createApp>;

const seedStatus = (deviceId: string, type: string, lastSeenAt: Date) =>
  prisma.deviceStatus.create({
    data: { deviceId, type, liveness: "ONLINE", lastSeenAt, mode: "MANUAL", relayStates: [], relayOnCount: 0 },
  });

beforeAll(async () => {
  rig = await startRig([LED, HUM]);
  app = createApp();
});

afterAll(async () => {
  stopJobs();
  await rig.stop();
});

beforeEach(async () => {
  await rig.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  stopJobs();
});

describe("health", () => {
  it("GET /health/live is 200 without auth, outside MAIN_ROUTE, and not rate limited", async () => {
    const res = await request(app).get("/health/live");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.headers["ratelimit"]).toBeUndefined();
    expect(res.headers["ratelimit-limit"]).toBeUndefined();
    expect((await request(app).get(`/${process.env.MAIN_ROUTE}/health/live`)).status).toBe(404);
  });

  it("GET /health/ready is 200 when Mongo and the broker are up, with no extra details", async () => {
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", mongo: "up", mqtt: "up" });
  });
});

describe("LivenessJob", () => {
  it("marks a silent LED controller STALE after 75 s (event + realtime), not before", async () => {
    const t = new Date();
    await seedStatus(LED.deviceId, "LED_CONTROLLER", t);

    expect(await LivenessJob.runOnce(new Date(t.getTime() + 74_000))).toBe(0);
    expect((await rig.status())?.liveness).toBe("ONLINE");

    rig.emits.length = 0;
    expect(await LivenessJob.runOnce(new Date(t.getTime() + 75_001))).toBe(1);
    expect((await rig.status())?.liveness).toBe("STALE");

    const events = await prisma.deviceEvent.findMany({ where: { deviceId: LED.deviceId, type: "STALE" } });
    expect(events).toHaveLength(1);
    expect(events[0]?.origin).toBe("BACKEND");
    const names = rig.emits.map((e) => e.event);
    expect(names).toContain("device:connectivity");
    expect(names).toContain("device:status");

    // already STALE: a second sweep changes nothing
    expect(await LivenessJob.runOnce(new Date(t.getTime() + 200_000))).toBe(0);
    expect(await prisma.deviceEvent.count({ where: { deviceId: LED.deviceId, type: "STALE" } })).toBe(1);
  });

  it("never marks the humidifier STALE", async () => {
    await seedStatus(HUM.deviceId, "HUMIDIFIER", new Date(Date.now() - 30 * DAY));
    expect(await LivenessJob.runOnce(new Date(Date.now() + DAY))).toBe(0);
    expect((await rig.status(HUM.deviceId))?.liveness).toBe("ONLINE");
  });

  it("does not sweep before MQTT has been connected for the start delay, or at all while never connected", async () => {
    const t = new Date(Date.now() - 10 * 60_000);
    await seedStatus(LED.deviceId, "LED_CONTROLLER", t);
    LivenessJob.start({ startDelayMs: 60_000 });
    stopJobs();
    expect(await LivenessJob.runOnce(new Date())).toBe(0); // connected only moments ago
    expect((await rig.status())?.liveness).toBe("ONLINE");

    const saved = MqttClient.firstConnectedAt;
    MqttClient.firstConnectedAt = null;
    try {
      expect(await LivenessJob.runOnce(new Date(Date.now() + DAY))).toBe(0);
    } finally {
      MqttClient.firstConnectedAt = saved;
    }
    LivenessJob.start({ startDelayMs: 0 });
    stopJobs();
    expect(await LivenessJob.runOnce(new Date())).toBe(1);
  });

  it("runs every 10 s under fake timers", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const spy = vi.spyOn(LivenessJob, "runOnce").mockResolvedValue(0);
    LivenessJob.start();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(spy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(spy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(spy).toHaveBeenCalledTimes(4);
    LivenessJob.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(spy).toHaveBeenCalledTimes(4);
  });
});

describe("RetentionJob", () => {
  it("computes the next 02:00 Asia/Kolkata (20:30 UTC)", () => {
    const next = (iso: string) => RetentionJob.nextRunAfter(new Date(iso)).toISOString();
    expect(next("2026-11-21T10:00:00Z")).toBe("2026-11-21T20:30:00.000Z"); // 02:00 IST on 22 Nov
    expect(next("2026-11-21T20:29:59Z")).toBe("2026-11-21T20:30:00.000Z");
    expect(next("2026-11-21T20:30:00Z")).toBe("2026-11-22T20:30:00.000Z");
    expect(next("2026-11-21T23:00:00Z")).toBe("2026-11-22T20:30:00.000Z");
  });

  it("deletes old events, relay changes and long-expired refresh tokens; keeps commands and audit rows", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - (RETENTION_DAYS + 1) * DAY);
    const recent = new Date(now.getTime() - (RETENTION_DAYS - 1) * DAY);
    await prisma.deviceEvent.createMany({
      data: [
        { deviceId: LED.deviceId, type: "ONLINE", origin: "BACKEND", data: {}, receivedAt: old },
        { deviceId: LED.deviceId, type: "OFFLINE", origin: "BACKEND", data: {}, receivedAt: recent },
      ],
    });
    await prisma.relayStateChange.createMany({
      data: [
        { deviceId: LED.deviceId, relay: 1, state: true, source: "COMMAND", simulation: true, at: old },
        { deviceId: LED.deviceId, relay: 2, state: true, source: "COMMAND", simulation: true, at: recent },
      ],
    });
    const uid = "aaaaaaaaaaaaaaaaaaaaaaaa";
    const tok = (n: string, expiresAt: Date) => ({
      userId: uid, tokenHash: `ret-${n}-${now.getTime()}`, familyId: "ret-fam", expiresAt,
    });
    await prisma.refreshToken.createMany({
      data: [
        tok("longgone", new Date(now.getTime() - 2 * DAY)),
        tok("justexpired", new Date(now.getTime() - 3600_000)),
        tok("valid", new Date(now.getTime() + DAY)),
      ],
    });
    const cmd = await prisma.command.create({
      data: {
        commandId: `ret-${now.getTime()}`, idempotencyKey: `ret-${now.getTime()}`, deviceId: LED.deviceId,
        action: "SET_RELAY", params: {}, source: "web", status: "EXECUTED", issuedAt: old, expiresAt: old,
      },
    });
    const aud = await prisma.auditLog.create({
      data: { actorType: "SYSTEM", action: "RETENTION_TEST", entity: "RetTest", at: old },
    });

    const res = await RetentionJob.runOnce(now);
    expect(res).toEqual({ deviceEvents: 1, relayStateChanges: 1, refreshTokens: 1 });

    expect((await prisma.deviceEvent.findMany({ where: { deviceId: LED.deviceId } })).map((e) => e.type)).toEqual(["OFFLINE"]);
    expect((await prisma.relayStateChange.findMany({ where: { deviceId: LED.deviceId } })).map((r) => r.relay)).toEqual([2]);
    const left = await prisma.refreshToken.findMany({ where: { familyId: "ret-fam" } });
    expect(left.map((t) => t.tokenHash.split("-")[1]).sort()).toEqual(["justexpired", "valid"]);
    expect(await prisma.command.findUnique({ where: { id: cmd.id } })).not.toBeNull();
    expect(await prisma.auditLog.findUnique({ where: { id: aud.id } })).not.toBeNull();

    await prisma.refreshToken.deleteMany({ where: { familyId: "ret-fam" } });
    await prisma.auditLog.deleteMany({ where: { entity: "RetTest" } });
  });

  it("sleeps until the next run, then repeats every 24 h (fake timers)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const spy = vi.spyOn(RetentionJob, "runOnce").mockResolvedValue({ deviceEvents: 0, relayStateChanges: 0, refreshTokens: 0 });
    const delay = RetentionJob.nextRunAfter(new Date()).getTime() - Date.now();
    RetentionJob.start();
    await vi.advanceTimersByTimeAsync(delay - 1000);
    expect(spy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(spy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DAY - 1);
    expect(spy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(spy).toHaveBeenCalledTimes(2);
    RetentionJob.stop();
    await vi.advanceTimersByTimeAsync(3 * DAY);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("startJobs / stopJobs", () => {
  it("starts and stops all four jobs (commands, liveness, retention, experiments) without leaking timers", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    startJobs();
    expect(vi.getTimerCount()).toBe(4);
    stopJobs();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("GET /health/ready with the broker stopped", () => {
  it("returns 503 with mqtt down", async () => {
    RealtimeEmitter.setSink(null);
    await rig.broker.close();
    await waitFor(() => !MqttClient.isConnected(), 5000, "client notices broker is gone");
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "unavailable", mongo: "up", mqtt: "down" });
    // liveness is unaffected
    expect((await request(app).get("/health/live")).status).toBe(200);
    // rig.stop() closes the broker again: make that a no-op
    rig.broker.close = async () => undefined;
  });
});
