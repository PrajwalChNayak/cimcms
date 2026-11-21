import { startSimulator, type Simulator, type SimulatorOptions } from "@cimcms/device-sim";
import { E2E } from "./env";

let current: Simulator | undefined;

/**
 * One LED-01 simulator at a time (same broker account). Uses the dev broker credentials from the
 * local credentials file. Default latency 1200 ms so the Pending state is observable.
 */
export const led = {
  async start(opts: Partial<SimulatorOptions> = {}): Promise<Simulator> {
    await led.stop();
    current = await startSimulator({
      url: E2E.mqttUrl,
      deviceId: E2E.deviceId,
      username: E2E.mqtt.ledUser,
      password: E2E.mqtt.ledPassword,
      latencyMs: 1200,
      heartbeatS: 10,
      ...opts,
    });
    return current;
  },
  async stop(): Promise<void> {
    const s = current;
    current = undefined;
    if (s) await s.stop();
  },
  get sim(): Simulator | undefined {
    return current;
  },
};
