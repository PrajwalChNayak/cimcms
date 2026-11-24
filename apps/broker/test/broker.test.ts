import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startBroker, type RunningBroker } from "../src/broker.js";

// DATABASE_URL is set by test/setup/postgres.ts (global setup) before this file runs.
const prisma = new PrismaClient();

// Throw-away passwords for accounts that exist only in the test database.
const PW = { device: "device-pw-1", device3: "device-pw-3", service: "service-pw", legacy: "legacy-pw", disabled: "disabled-pw" };

let broker: RunningBroker;
const clients: MqttClient[] = [];

const start = (): Promise<RunningBroker> =>
  startBroker({ prisma, port: 0, healthPort: 0, maxFailures: 3, failWindowMs: 60_000 });

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Connects and resolves on CONNACK success; rejects with the mqtt.js error (code = CONNACK return code). */
function connect(username: string, password: string, clientId = username, extra: IClientOptions = {}): Promise<MqttClient> {
  return new Promise((resolve, reject) => {
    const c = mqtt.connect({
      host: "127.0.0.1",
      port: broker.port,
      username,
      password,
      clientId,
      reconnectPeriod: 0,
      connectTimeout: 10_000,
      ...extra,
    });
    clients.push(c);
    c.once("connect", () => resolve(c));
    c.once("error", (err) => {
      c.end(true);
      reject(err);
    });
  });
}

const refusedCode = async (p: Promise<MqttClient>): Promise<number | undefined> => {
  try {
    await p;
  } catch (err) {
    return (err as { code?: number }).code;
  }
  throw new Error("expected the login to be refused");
};

const closed = (c: MqttClient): Promise<void> =>
  new Promise((resolve) => (c.connected ? c.once("close", () => resolve()) : resolve()));

interface Got {
  topic: string;
  payload: string;
  retain: boolean;
}

/** Collects messages a client receives (optionally only on one topic). */
function collect(c: MqttClient, topic?: string): Got[] {
  const got: Got[] = [];
  c.on("message", (t, p, packet) => {
    if (!topic || t === topic) got.push({ topic: t, payload: p.toString(), retain: packet.retain });
  });
  return got;
}

async function waitFor(check: () => boolean | Promise<boolean>, ms = 5_000): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check()) return;
    await sleep(20);
  }
  throw new Error("condition not met in time");
}

const hash = (pw: string): Promise<string> => argon2.hash(pw, { type: argon2.argon2id });

beforeAll(async () => {
  await prisma.mqttAccount.deleteMany();
  const now = new Date();
  await prisma.mqttAccount.createMany({
    data: [
      { username: "LED-02", passwordHash: await hash(PW.device), kind: "DEVICE", deviceId: "LED-02", deviceType: "LED_CONTROLLER", passwordSetAt: now },
      { username: "LED-03", passwordHash: await hash(PW.device3), kind: "DEVICE", deviceId: "LED-03", deviceType: "LED_CONTROLLER", passwordSetAt: now },
      { username: "LED-09", passwordHash: await hash(PW.disabled), kind: "DEVICE", deviceId: "LED-09", deviceType: "LED_CONTROLLER", enabled: false, passwordSetAt: now },
      { username: "cimcms-api", passwordHash: await hash(PW.service), kind: "SERVICE", passwordSetAt: now },
      { username: "mqttuser", passwordHash: await hash(PW.legacy), kind: "LEGACY", passwordSetAt: now },
    ],
  });
});

afterAll(async () => {
  await prisma.mqttAccount.deleteMany();
  await prisma.mqttRetained.deleteMany();
  await prisma.$disconnect();
});

// A fresh broker per test: the per-IP failure counter must not leak between tests.
beforeEach(async () => {
  await prisma.mqttRetained.deleteMany();
  broker = await start();
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.end(true);
  await broker.close();
});

describe("logins", () => {
  it("device logs in and its telemetry reaches a SERVICE subscriber", async () => {
    const api = await connect("cimcms-api", PW.service, "api-1");
    await api.subscribeAsync("cimcms/+/+/telemetry", { qos: 1 });
    const got = collect(api);
    const dev = await connect("LED-02", PW.device);
    await dev.publishAsync("cimcms/led/LED-02/telemetry", '{"t":1}', { qos: 1 });
    await waitFor(() => got.length === 1);
    expect(got[0]).toMatchObject({ topic: "cimcms/led/LED-02/telemetry", payload: '{"t":1}' });
  });

  it("wrong password is refused (not authorised)", async () => {
    expect(await refusedCode(connect("LED-02", "wrong"))).toBe(5);
  });

  it("unknown user is refused", async () => {
    expect(await refusedCode(connect("nobody", "whatever"))).toBe(5);
  });

  it("disabled account is refused", async () => {
    expect(await refusedCode(connect("LED-09", PW.disabled))).toBe(5);
  });

  it("device with client ID different from its username is refused", async () => {
    expect(await refusedCode(connect("LED-02", PW.device, "LED-03"))).toBe(5);
    expect(await refusedCode(connect("LED-02", PW.device, "something-else"))).toBe(5);
  });

  it("after 3 failures from 127.0.0.1 even a correct password is refused", async () => {
    for (let i = 0; i < 3; i++) expect(await refusedCode(connect("LED-02", `wrong-${i}`))).toBe(5);
    expect(await refusedCode(connect("LED-02", PW.device))).toBe(5);
    expect(await refusedCode(connect("mqttuser", PW.legacy, "legacy-1"))).toBe(5);
  });
});

describe("topic permissions", () => {
  it("device publishing to another device's topic is disconnected and the message is not delivered", async () => {
    const api = await connect("cimcms-api", PW.service, "api-1");
    await api.subscribeAsync("cimcms/+/+/telemetry", { qos: 1 });
    const got = collect(api);
    const dev = await connect("LED-02", PW.device);
    const gone = closed(dev);
    dev.publish("cimcms/led/LED-03/telemetry", "spoofed", { qos: 0 });
    await gone;
    await sleep(300);
    expect(got).toEqual([]);
  });

  it("device subscribing to another device's command topic gets SUBACK failure and stays connected", async () => {
    const dev = await connect("LED-02", PW.device);
    const err = await dev.subscribeAsync("cimcms/led/LED-03/command", { qos: 1 }).then(
      () => null,
      (e: { packet?: { granted?: number[] } }) => e,
    );
    // mqtt.js rejects on a failure return code and keeps the SUBACK packet on the error.
    expect(err).not.toBeNull();
    expect(err?.packet?.granted).toEqual([0x80]);
    expect(dev.connected).toBe(true);
    const ok = await dev.subscribeAsync("cimcms/led/LED-02/command", { qos: 1 });
    expect(ok[0]?.qos).toBe(1);
  });

  it("SERVICE command reaches the device", async () => {
    const dev = await connect("LED-02", PW.device);
    await dev.subscribeAsync("cimcms/led/LED-02/command", { qos: 1 });
    const got = collect(dev);
    const api = await connect("cimcms-api", PW.service, "api-1");
    await api.publishAsync("cimcms/led/LED-02/command", '{"action":"on"}', { qos: 1 });
    await waitFor(() => got.length === 1);
    expect(got[0]).toMatchObject({ topic: "cimcms/led/LED-02/command", payload: '{"action":"on"}' });
  });

  it("LEGACY can publish and subscribe on an arbitrary topic", async () => {
    const sub = await connect("mqttuser", PW.legacy, "legacy-sub");
    await sub.subscribeAsync("test", { qos: 1 });
    const got = collect(sub);
    const pub = await connect("mqttuser", PW.legacy, "legacy-pub");
    await pub.publishAsync("test", "hello", { qos: 1 });
    await waitFor(() => got.length === 1);
    expect(got[0]).toMatchObject({ topic: "test", payload: "hello" });
  });
});

describe("account-changed", () => {
  it("from SERVICE closes the target device session and is not forwarded", async () => {
    const legacy = await connect("mqttuser", PW.legacy, "legacy-sub");
    await legacy.subscribeAsync("#", { qos: 1 });
    const got = collect(legacy, "cimcms/broker/account-changed");
    const dev = await connect("LED-02", PW.device);
    const other = await connect("LED-03", PW.device3);
    const gone = closed(dev);
    const api = await connect("cimcms-api", PW.service, "api-1");
    await api.publishAsync("cimcms/broker/account-changed", JSON.stringify({ username: "LED-02" }), { qos: 1 });
    await gone;
    await sleep(300);
    expect(got).toEqual([]);
    expect(other.connected).toBe(true);
    expect(api.connected).toBe(true);
    expect(legacy.connected).toBe(true);
  });

  it("from SERVICE with a usernames list closes all of them", async () => {
    const a = await connect("LED-02", PW.device);
    const b = await connect("LED-03", PW.device3);
    const gone = Promise.all([closed(a), closed(b)]);
    const api = await connect("cimcms-api", PW.service, "api-1");
    await api.publishAsync("cimcms/broker/account-changed", JSON.stringify({ usernames: ["LED-02", "LED-03"] }), { qos: 1 });
    await gone;
  });

  it("from LEGACY is not allowed: the LEGACY client is disconnected", async () => {
    const dev = await connect("LED-02", PW.device);
    const legacy = await connect("mqttuser", PW.legacy, "legacy-1");
    const gone = closed(legacy);
    legacy.publish("cimcms/broker/account-changed", JSON.stringify({ username: "LED-02" }), { qos: 0 });
    await gone;
    await sleep(200);
    expect(dev.connected).toBe(true);
  });
});

describe("retained messages", () => {
  it("survive a broker restart; an empty retained payload deletes them", async () => {
    const topic = "cimcms/led/LED-02/status";
    const dev = await connect("LED-02", PW.device);
    await dev.publishAsync(topic, '{"online":true}', { qos: 1, retain: true });
    await waitFor(async () => (await prisma.mqttRetained.count({ where: { topic } })) === 1);
    dev.end(true);

    await broker.close();
    broker = await start();

    const api = await connect("cimcms-api", PW.service, "api-1");
    const got = collect(api, topic);
    await api.subscribeAsync("cimcms/+/+/status", { qos: 1 });
    await waitFor(() => got.length === 1);
    expect(got[0]).toMatchObject({ payload: '{"online":true}', retain: true });
    api.end(true);

    const dev2 = await connect("LED-02", PW.device);
    await dev2.publishAsync(topic, "", { qos: 1, retain: true });
    await waitFor(async () => (await prisma.mqttRetained.count({ where: { topic } })) === 0);
    dev2.end(true);

    await broker.close();
    broker = await start();

    const api2 = await connect("cimcms-api", PW.service, "api-2");
    const got2 = collect(api2, topic);
    await api2.subscribeAsync("cimcms/+/+/status", { qos: 1 });
    await sleep(300);
    expect(got2).toEqual([]);
  });
});

describe("health", () => {
  it("GET /health returns 200 with the database up", async () => {
    const res = await fetch(`http://127.0.0.1:${broker.healthPort}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", database: "up" });
    expect((await fetch(`http://127.0.0.1:${broker.healthPort}/other`)).status).toBe(404);
  });
});
