import argon2 from "argon2";
import mqtt, { type MqttClient } from "mqtt";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { startBroker, type BrokerOptions, type RunningBroker } from "../src/broker.js";

/** Rate limits, size limits, connection caps, login cache during a database outage, retained write-behind. */
const prisma = new PrismaClient({ datasourceUrl: process.env.BROKER_DATABASE_URL });
const PW = "robust-pw-1";
const IDS = ["ROB-01", "ROB-02", "ROB-03"];
const clients: MqttClient[] = [];
let broker: RunningBroker | undefined;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const start = (o: Partial<BrokerOptions> = {}) =>
  startBroker({ prisma, port: 0, statsIntervalMs: 0, retainedFlushMs: 100, ...o });

function connect(id: string, password = PW): Promise<MqttClient> {
  return new Promise((resolve, reject) => {
    const c = mqtt.connect({ host: "127.0.0.1", port: broker!.port, username: id, password, clientId: id, reconnectPeriod: 0, connectTimeout: 5_000 });
    clients.push(c);
    c.once("connect", () => resolve(c));
    c.once("error", (e) => {
      c.end(true);
      reject(e);
    });
    c.once("close", () => reject(new Error("closed before CONNACK")));
  });
}
const closed = (c: MqttClient, ms = 3000) =>
  new Promise<boolean>((resolve) => {
    if (!c.connected) return resolve(true);
    const t = setTimeout(() => resolve(false), ms);
    c.once("close", () => {
      clearTimeout(t);
      resolve(true);
    });
  });
const telemetry = (id: string) => `cimcms/led/${id}/telemetry`;

beforeAll(async () => {
  const hash = await argon2.hash(PW, { type: argon2.argon2id });
  await prisma.mqttAccount.deleteMany({ where: { username: { in: IDS } } });
  await prisma.mqttAccount.createMany({
    data: IDS.map((id) => ({ username: id, passwordHash: hash, kind: "DEVICE" as const, deviceId: id, deviceType: "LED_CONTROLLER", passwordSetAt: new Date() })),
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const c of clients.splice(0)) c.end(true);
  await broker?.close();
  broker = undefined;
});

afterAll(async () => {
  await prisma.mqttAccount.deleteMany({ where: { username: { in: IDS } } });
  await prisma.mqttRetained.deleteMany({ where: { topic: { startsWith: "cimcms/led/ROB-" } } });
  await prisma.$disconnect();
});

describe("limits", () => {
  it("disconnects a client that sends a payload larger than maxPayloadBytes", async () => {
    broker = await start({ maxPayloadBytes: 1024 });
    const c = await connect("ROB-01");
    c.publish(telemetry("ROB-01"), Buffer.alloc(2048, 1));
    expect(await closed(c)).toBe(true);
    expect(broker.stats().droppedTooLarge).toBe(1);
  });

  it("allows a steady 1 message/second, disconnects a flood above the rate limit", async () => {
    broker = await start({ maxMessagesPerSecond: 5, messageBurst: 5 });
    const ok = await connect("ROB-01");
    for (let i = 0; i < 4; i++) {
      ok.publish(telemetry("ROB-01"), "{}");
      await sleep(250);
    }
    expect(ok.connected).toBe(true);

    const flood = await connect("ROB-02");
    for (let i = 0; i < 30; i++) flood.publish(telemetry("ROB-02"), "{}");
    expect(await closed(flood)).toBe(true);
    expect(broker.stats().droppedRateLimited).toBeGreaterThan(0);
    expect(ok.connected).toBe(true); // the well-behaved device is not affected
  });

  it("refuses connections above maxConnectionsPerIp", async () => {
    broker = await start({ maxConnectionsPerIp: 2 });
    await connect("ROB-01");
    await connect("ROB-02");
    await expect(connect("ROB-03")).rejects.toThrow();
    expect(broker.stats().refusedConnections).toBe(1);
  });
});

describe("database outage", () => {
  it("keeps known devices online from the login cache; refuses unknown logins with 'server unavailable'", async () => {
    broker = await start();
    (await connect("ROB-01")).end(true); // good login: cached
    await sleep(100);

    vi.spyOn(prisma.mqttAccount, "findUnique").mockRejectedValue(new Error("database down"));
    const again = await connect("ROB-01"); // same password while the DB is down
    expect(again.connected).toBe(true);
    expect(broker.stats().degradedLogins).toBe(1);

    const wrong = await connect("ROB-01", "not-the-password").catch((e: { code?: number }) => e.code);
    expect(wrong).toBe(3); // server unavailable, never accepted
    const unknown = await connect("ROB-02").catch((e: { code?: number }) => e.code);
    expect(unknown).toBe(3); // never logged in before: no cache entry
  });
});

describe("retained write-behind", () => {
  it("writes only the newest retained value and nothing is lost on a clean stop", async () => {
    broker = await start({ retainedFlushMs: 60_000 }); // no timer flush during the test
    const c = await connect("ROB-01");
    const topic = "cimcms/led/ROB-01/status";
    for (let i = 1; i <= 20; i++) c.publish(topic, JSON.stringify({ n: i }), { retain: true, qos: 1 });
    await sleep(300);
    expect(await prisma.mqttRetained.findUnique({ where: { topic } })).toBeNull(); // not yet written
    await broker.close();
    broker = undefined;
    const row = await prisma.mqttRetained.findUnique({ where: { topic } });
    expect(JSON.parse(Buffer.from(row!.payload).toString())).toEqual({ n: 20 });
  });
});
