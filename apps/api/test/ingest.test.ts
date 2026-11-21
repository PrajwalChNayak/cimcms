import { randomUUID } from "node:crypto";
import mqtt, { type MqttClient as RawClient } from "mqtt";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "@models/prisma.client";
import TelemetryRepository from "@repositories/telemetry.repository";
import IngestService from "@services/ingest.service";
import { LED, startRig, type Rig } from "./rig";
import { sleep, waitFor } from "./helpers/wait";

const HUM = { deviceId: "HUM-01", deviceType: "HUMIDIFIER" } as const;

let rig: Rig;
let pub: RawClient;

const publish = (topic: string, payload: string, retain = false): Promise<unknown> =>
  pub.publishAsync(topic, payload, { qos: 1, retain });

const status = (deviceId = LED.deviceId) =>
  prisma.deviceStatus.findUnique({ where: { deviceId } });
const events = (type: string, deviceId = LED.deviceId) =>
  prisma.deviceEvent.findMany({ where: { deviceId, type } });

/** A valid telemetry payload built by hand (the simulator cannot send old seq numbers). */
function telemetry(over: Record<string, unknown> = {}): string {
  const states = Array<boolean>(16).fill(false);
  return JSON.stringify({
    schema_version: 1,
    device_id: LED.deviceId,
    firmware_version: "t-1",
    timestamp_utc: new Date().toISOString(),
    boot_id: "bootA",
    seq: 10,
    mode: "MANUAL",
    simulation_mode: true,
    connectivity: { wifi_connected: true, mqtt_connected: true },
    relay_states: states,
    relay_on_count: 0,
    ...over,
  });
}

beforeAll(async () => {
  rig = await startRig([LED, HUM]);
  pub = mqtt.connect(rig.broker.url, { clientId: "test-pub" });
  await new Promise<void>((r) => pub.once("connect", () => r()));
});

afterAll(async () => {
  await pub.endAsync(true);
  await rig.stop();
});

beforeEach(async () => {
  await rig.settle();
  await rig.reset();
});

describe("ingest: telemetry and status", () => {
  it("creates a DeviceStatus with 16 relay states, goes ONLINE and stores a time-series point", async () => {
    const sim = await rig.sim();
    const row = await waitFor(async () => {
      const s = await status();
      return s?.relayStates.length === 16 ? s : null;
    }, 5000, "snapshot");

    expect(row.liveness).toBe("ONLINE");
    expect(row.mode).toBe("MANUAL");
    expect(row.simulationMode).toBe(true);
    expect(row.bootId).toBe(sim.state.bootId);
    expect(row.relayOnCount).toBe(0);
    expect(row.lastSeenAt).toBeInstanceOf(Date);
    expect(row.connectivity).toMatchObject({ wifiConnected: true, mqttConnected: true });

    // exactly one ONLINE event (written on change only, not per message)
    await IngestService.idle();
    expect(await events("ONLINE")).toHaveLength(1);

    const points = await TelemetryRepository.find({ deviceId: LED.deviceId, limit: 10 });
    expect(points.length).toBeGreaterThanOrEqual(1);
    expect(points[0]?.relayStates).toHaveLength(16);

    // realtime: status snapshot + telemetry were emitted
    const names = rig.emits.map((e) => e.event);
    expect(names).toContain("device:status");
    expect(names).toContain("device:telemetry");
    expect(names).toContain("device:connectivity");
  });

  it("a keypad toggle in the simulator creates exactly one RelayStateChange", async () => {
    const sim = await rig.sim();
    await waitFor(async () => (await status())?.relayStates.length === 16, 5000, "first telemetry");
    await sim.toggle(3);

    const changes = await waitFor(async () => {
      const rows = await prisma.relayStateChange.findMany({ where: { deviceId: LED.deviceId } });
      return rows.length > 0 ? rows : null;
    }, 5000, "relay change");
    await IngestService.idle();
    const all = await prisma.relayStateChange.findMany({ where: { deviceId: LED.deviceId } });
    expect(all).toHaveLength(1);
    expect(changes[0]).toMatchObject({ relay: 3, state: true, simulation: true });
    expect(["KEYPAD", "UNKNOWN"]).toContain(changes[0]?.source);

    const row = await status();
    expect(row?.relayStates[2]).toBe(true);
    expect(row?.relayOnCount).toBe(1);
    expect(rig.emits.some((e) => e.event === "device:relay_state")).toBe(true);
    // the RELAY_CHANGED device event is stored but never writes RelayStateChange itself
    expect(await events("RELAY_CHANGED")).toHaveLength(1);
  });

  it("a retained online after a backend restart gives UNKNOWN, then ONLINE after the REQUEST_STATUS reply", async () => {
    await rig.sim();
    await waitFor(async () => (await status())?.relayStates.length === 16, 5000, "first telemetry");

    // Backend goes down; the DB says the device was last seen offline.
    await rig.restartBackend(async () => {
      await IngestService.idle();
      await prisma.deviceStatus.update({
        where: { deviceId: LED.deviceId },
        data: { liveness: "OFFLINE" },
      });
      rig.emits.length = 0;
    });

    await waitFor(
      () =>
        rig.emits.some(
          (e) =>
            e.event === "device:connectivity" &&
            (e.envelope.data as { liveness: string }).liveness === "UNKNOWN",
        ),
      5000,
      "UNKNOWN emitted",
    );
    await waitFor(async () => (await status())?.liveness === "ONLINE", 5000, "ONLINE again");

    // a system REQUEST_STATUS command was sent and answered
    const cmds = await prisma.command.findMany({ where: { deviceId: LED.deviceId } });
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ action: "REQUEST_STATUS", source: "system" });
  });

  it("sim crash() makes the device OFFLINE with exactly one OFFLINE event", async () => {
    const sim = await rig.sim();
    await waitFor(async () => (await status())?.liveness === "ONLINE", 5000, "online");
    await sim.crash();

    await waitFor(async () => (await status())?.liveness === "OFFLINE", 5000, "offline");
    await IngestService.idle();
    expect(await events("OFFLINE")).toHaveLength(1);
  });

  it("invalid telemetry (15 relays) is rejected and the snapshot stays unchanged", async () => {
    await rig.sim();
    const before = await waitFor(async () => {
      const s = await status();
      return s?.relayStates.length === 16 ? s : null;
    }, 5000, "snapshot");

    await publish(
      `cimcms/led/${LED.deviceId}/telemetry`,
      telemetry({ relay_states: Array<boolean>(15).fill(true), relay_on_count: 15 }),
    );
    const rejected = await waitFor(
      async () => {
        const e = await events("SCHEMA_REJECTED");
        return e.length > 0 ? e : null;
      },
      5000,
      "SCHEMA_REJECTED",
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.origin).toBe("BACKEND");
    const data = rejected[0]?.data as { kind: string; issues: unknown[]; sample: string };
    expect(data.kind).toBe("telemetry");
    expect(data.issues.length).toBeGreaterThan(0);
    expect(data.sample.length).toBeLessThanOrEqual(200);

    const after = await status();
    expect(after?.relayStates).toEqual(before.relayStates);
    expect(after?.relayOnCount).toBe(before.relayOnCount);
    expect(after?.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it("rejects non-JSON, a wrong device_id and keeps going", async () => {
    await publish(`cimcms/led/${LED.deviceId}/telemetry`, "not json");
    await publish(`cimcms/led/${LED.deviceId}/telemetry`, telemetry({ device_id: "LED-02" }));
    await waitFor(async () => (await events("SCHEMA_REJECTED")).length === 2, 5000, "two rejections");
    expect(await status()).toBeNull();
  });

  it("ignores a telemetry whose seq is not newer than the stored one (time-series still gets it)", async () => {
    const topic = `cimcms/led/${LED.deviceId}/telemetry`;
    const on = Array<boolean>(16).fill(false);
    on[0] = true;
    await publish(topic, telemetry({ seq: 10, relay_states: on, relay_on_count: 1 }));
    await waitFor(async () => (await status())?.lastSeq === 10, 5000, "seq 10 applied");

    const tsBefore = (await TelemetryRepository.find({ deviceId: LED.deviceId, limit: 100 })).length;
    // older seq with different relays: must not touch the snapshot
    await publish(topic, telemetry({ seq: 9 }));
    await waitFor(
      async () =>
        (await TelemetryRepository.find({ deviceId: LED.deviceId, limit: 100 })).length > tsBefore,
      5000,
      "time-series point of the old message",
    );
    const row = await status();
    expect(row?.lastSeq).toBe(10);
    expect(row?.relayStates[0]).toBe(true);
    expect(row?.relayOnCount).toBe(1);

    // same boot, newer seq is applied and diffs against the stored states
    await publish(topic, telemetry({ seq: 11 }));
    await waitFor(async () => (await status())?.lastSeq === 11, 5000, "seq 11 applied");
    const changes = await prisma.relayStateChange.findMany({ where: { deviceId: LED.deviceId } });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ relay: 1, state: false });
  });

  it("a new boot_id attributes relay changes to BOOT", async () => {
    const topic = `cimcms/led/${LED.deviceId}/telemetry`;
    const on = Array<boolean>(16).fill(false);
    on[4] = true;
    await publish(topic, telemetry({ seq: 1, boot_id: "bootA", relay_states: on, relay_on_count: 1 }));
    await waitFor(async () => (await status())?.bootId === "bootA", 5000, "bootA");
    await publish(topic, telemetry({ seq: 0, boot_id: "bootB" }));
    await waitFor(async () => (await status())?.bootId === "bootB", 5000, "bootB");
    const changes = await prisma.relayStateChange.findMany({ where: { deviceId: LED.deviceId } });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ relay: 5, state: false, source: "BOOT" });
  });

  it("MODE_CHANGED events update the mode and emit device:status", async () => {
    const sim = await rig.sim();
    await waitFor(async () => (await status())?.relayStates.length === 16, 5000, "snapshot");
    await sim.setMode("MAINTENANCE");
    await waitFor(async () => (await status())?.mode === "MAINTENANCE", 5000, "mode");
    expect(await events("MODE_CHANGED")).toHaveLength(1);
    expect(rig.emits.some((e) => e.event === "device:event")).toBe(true);
  });

  it("humidifier: plain-text online/offline is accepted, an empty retained clear is a no-op", async () => {
    await publish(`cimcms/humidifier/${HUM.deviceId}/status`, "online", true);
    await waitFor(async () => (await status(HUM.deviceId))?.liveness === "ONLINE", 5000, "hum online");
    await publish(`cimcms/humidifier/${HUM.deviceId}/status`, "offline", true);
    await waitFor(async () => (await status(HUM.deviceId))?.liveness === "OFFLINE", 5000, "hum offline");

    await publish(`cimcms/humidifier/${HUM.deviceId}/status`, "", true); // clear retained
    await sleep(200);
    await IngestService.idle();
    expect(await events("SCHEMA_REJECTED", HUM.deviceId)).toHaveLength(0);
    expect((await status(HUM.deviceId))?.liveness).toBe("OFFLINE");
    // the backend never published to a humidifier command topic (D-13)
    expect(await prisma.command.count({ where: { deviceId: HUM.deviceId } })).toBe(0);
  });

  it("an ack for an unknown command id leaves no command behind", async () => {
    await publish(
      `cimcms/led/${LED.deviceId}/ack`,
      JSON.stringify({
        schema_version: 1,
        command_id: randomUUID(),
        device_id: LED.deviceId,
        result: "EXECUTED",
        timestamp_utc: new Date().toISOString(),
        simulation_mode: true,
      }),
    );
    await waitFor(async () => (await status())?.liveness === "ONLINE", 5000, "ack counts as seen");
    expect(await prisma.command.count({ where: { deviceId: LED.deviceId } })).toBe(0);
  });
});
