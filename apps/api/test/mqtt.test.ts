import { MAX_MQTT_PAYLOAD_BYTES } from "@cimcms/contracts";
import mqtt, { type MqttClient as RawClient } from "mqtt";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@models/prisma.client";
import MqttClient from "@/mqtt/mqtt.client";
import MqttDispatcher from "@/mqtt/mqtt.dispatcher";
import IngestService from "@services/ingest.service";
import { startTestBroker, type TestBroker } from "./setup/broker";

let broker: TestBroker;
let pub: RawClient;
const spy = vi.spyOn(IngestService, "handle").mockResolvedValue(undefined);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await sleep(20);
}

function publish(topic: string, payload: string | Buffer, retain = false): Promise<void> {
  return new Promise((resolve, reject) =>
    pub.publish(topic, payload, { qos: 1, retain }, (e) => (e ? reject(e) : resolve())),
  );
}

const DEVICE_IDS = ["LED-01", "HUM-01"];

beforeAll(async () => {
  broker = await startTestBroker();
  await prisma.device.deleteMany({ where: { deviceId: { in: DEVICE_IDS } } });
  await prisma.device.createMany({
    data: [
      { deviceId: "LED-01", deviceType: "LED_CONTROLLER" },
      { deviceId: "HUM-01", deviceType: "HUMIDIFIER" },
    ],
  });
  MqttDispatcher.attach();
  await MqttClient.connect({
    url: broker.url,
    clientId: "test-backend",
    monitorHumidifier: true,
  });
  pub = mqtt.connect(broker.url, { clientId: "test-pub" });
  await new Promise<void>((r) => pub.once("connect", () => r()));
});

afterAll(async () => {
  pub.end(true);
  await MqttClient.shutdown();
  await broker.close();
  await prisma.device.deleteMany({ where: { deviceId: { in: DEVICE_IDS } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  spy.mockClear();
  MqttDispatcher.clearCache();
});

describe("MQTT client and dispatcher", () => {
  it("is connected and publishes backend online retained", async () => {
    expect(MqttClient.isConnected()).toBe(true);
    expect(MqttClient.firstConnectedAt).toBeInstanceOf(Date);

    const sub = mqtt.connect(broker.url, { clientId: "test-sub" });
    const got = new Promise<string>((resolve) =>
      sub.on("message", (_t, p) => resolve(p.toString())),
    );
    sub.subscribe("cimcms/backend/status");
    expect(await got).toBe('{"state":"online"}');
    sub.end(true);
  });

  it("delivers a telemetry message for a registered device to ingest", async () => {
    await publish("cimcms/led/LED-01/telemetry", '{"x":1}');
    await waitFor(() => spy.mock.calls.length > 0);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("telemetry", "LED-01", "LED_CONTROLLER", '{"x":1}', {
      retained: false,
    });
  });

  it("passes the retained flag for retained status messages", async () => {
    await publish("cimcms/led/LED-01/status", '{"state":"online"}', true);
    await waitFor(() => spy.mock.calls.length > 0);
    expect(spy.mock.calls[0]?.[0]).toBe("status");
    // Received live (not replayed), so the flag reflects how the broker forwarded it.
    expect(spy.mock.calls[0]?.[4]).toHaveProperty("retained");
    await publish("cimcms/led/LED-01/status", "", true); // clear retained
    await waitFor(() => spy.mock.calls.length > 1); // the clear is forwarded too
    await sleep(50);
  });

  it("drops messages for unregistered devices", async () => {
    await publish("cimcms/led/LED-99/telemetry", "{}");
    await sleep(300);
    expect(spy).not.toHaveBeenCalled();
  });

  it("drops oversized payloads", async () => {
    await publish("cimcms/led/LED-01/telemetry", Buffer.alloc(MAX_MQTT_PAYLOAD_BYTES + 1, "a"));
    await sleep(300);
    expect(spy).not.toHaveBeenCalled();
  });

  it("drops kinds the driver does not handle (humidifier telemetry)", async () => {
    const packet = { retain: false } as never;
    await MqttDispatcher.dispatch("cimcms/humidifier/HUM-01/telemetry", Buffer.from("{}"), packet);
    expect(spy).not.toHaveBeenCalled();
    await MqttDispatcher.dispatch("cimcms/humidifier/HUM-01/status", Buffer.from("online"), packet);
    expect(spy).toHaveBeenCalledWith("status", "HUM-01", "HUMIDIFIER", "online", {
      retained: false,
    });
  });

  it("survives an ingest failure and keeps processing", async () => {
    spy.mockRejectedValueOnce(new Error("boom"));
    await publish("cimcms/led/LED-01/event", "{}");
    await publish("cimcms/led/LED-01/ack", "{}");
    await waitFor(() => spy.mock.calls.length >= 2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("ignores topics that do not parse", async () => {
    await MqttDispatcher.dispatch("cimcms/led/x/telemetry", Buffer.from("{}"), {} as never);
    expect(spy).not.toHaveBeenCalled();
  });
});
