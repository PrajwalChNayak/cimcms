import type { SocketEnvelope } from "@cimcms/contracts";
import { startSimulator, type Simulator, type SimulatorOptions } from "@cimcms/device-sim";
import { initTimeseries } from "@models/init/timeseries";
import prisma from "@models/prisma.client";
import { startMqtt } from "@/mqtt";
import MqttClient from "@/mqtt/mqtt.client";
import MqttDispatcher from "@/mqtt/mqtt.dispatcher";
import IngestService from "@services/ingest.service";
import { RealtimeEmitter, type RealtimeSink } from "@/realtime/realtime.emitter";
import { startTestBroker, type TestBroker } from "./setup/broker";
import { sleep } from "./helpers/wait";

export interface TestDevice {
  deviceId: string;
  deviceType: "LED_CONTROLLER" | "HUMIDIFIER";
}

export const LED: TestDevice = { deviceId: "LED-01", deviceType: "LED_CONTROLLER" };

export interface RecordedEmit {
  deviceId: string;
  event: string;
  envelope: SocketEnvelope<unknown>;
}

export interface Rig {
  broker: TestBroker;
  emits: RecordedEmit[];
  sims: Simulator[];
  /** Starts a simulator against the test broker. */
  sim(options?: Partial<SimulatorOptions>): Promise<Simulator>;
  /** Clean backend shutdown (as on SIGTERM), run `whileDown`, start again with the same client id. */
  restartBackend(whileDown?: () => Promise<void>): Promise<void>;
  /** Crashes running simulators and waits until their last will messages were ingested. */
  settle(): Promise<void>;
  /** Snapshot row of a device (default LED-01), or null. */
  status(deviceId?: string): Promise<{ relayStates: boolean[]; liveness: string } | null>;
  /** Removes device state, commands and events of the given devices. */
  reset(): Promise<void>;
  stop(): Promise<void>;
}

const CLIENT_ID = "test-backend";

/**
 * In-process broker + backend MQTT client + ingest wired together, with a
 * recording realtime sink. Simulators connect to the same broker.
 */
export async function startRig(devices: TestDevice[] = [LED]): Promise<Rig> {
  const broker = await startTestBroker();
  await initTimeseries();
  const ids = devices.map((d) => d.deviceId);
  await prisma.device.deleteMany({ where: { deviceId: { in: ids } } });
  await prisma.device.createMany({ data: devices });

  const emits: RecordedEmit[] = [];
  const sink: RealtimeSink = {
    emit: (deviceId, event, envelope) => {
      emits.push({ deviceId, event, envelope });
    },
  };
  RealtimeEmitter.setSink(sink);

  const sims: Simulator[] = [];

  const connectBackend = async (): Promise<void> => {
    const subscribed = new Promise<void>((resolve) => {
      const onSub = (_subs: unknown, client: { id: string }): void => {
        if (client.id === CLIENT_ID) {
          broker.aedes.off("subscribe", onSub);
          resolve();
        }
      };
      broker.aedes.on("subscribe", onSub);
    });
    await startMqtt({ url: broker.url, clientId: CLIENT_ID, monitorHumidifier: true });
    await subscribed;
    await sleep(30);
  };
  await connectBackend();

  const reset = async (): Promise<void> => {
    await IngestService.idle();
    const where = { deviceId: { in: ids } };
    await prisma.deviceStatus.deleteMany({ where });
    await prisma.deviceEvent.deleteMany({ where });
    await prisma.relayStateChange.deleteMany({ where });
    await prisma.command.deleteMany({ where });
    emits.length = 0;
    MqttDispatcher.clearCache();
  };

  const rig: Rig = {
    broker,
    emits,
    sims,
    async sim(options = {}) {
      const s = await startSimulator({
        url: broker.url,
        deviceId: LED.deviceId,
        latencyMs: 0,
        heartbeatS: 3600,
        ...options,
      });
      sims.push(s);
      return s;
    },
    async restartBackend(whileDown) {
      await MqttClient.shutdown();
      await whileDown?.();
      await connectBackend();
    },
    reset,
    status: (deviceId = LED.deviceId) => prisma.deviceStatus.findUnique({ where: { deviceId } }),
    async settle() {
      const had = sims.length > 0;
      for (const s of sims.splice(0)) await s.crash().catch(() => undefined);
      if (had) await sleep(250);
      await IngestService.idle();
    },
    async stop() {
      await rig.settle();
      await MqttClient.shutdown();
      RealtimeEmitter.setSink(null);
      await broker.close();
      await prisma.device.deleteMany({ where: { deviceId: { in: ids } } });
      await reset();
      await prisma.$disconnect();
    },
  };
  return rig;
}
