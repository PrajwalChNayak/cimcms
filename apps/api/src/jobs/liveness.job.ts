import { DEVICE_TYPES, type DeviceType } from "@cimcms/contracts";
import MqttClient from "@/mqtt/mqtt.client";
import prisma from "@models/prisma.client";
import DeviceStateService from "@services/devicestate.service";
import logger from "@utils/logger.utils";

export interface LivenessOptions {
  /** Sweep period. Plan: 10 s. */
  intervalMs?: number;
  /**
   * Do not sweep until the MQTT client has been connected this long, so retained
   * status messages can refresh devices first (no STALE/ONLINE flapping after a restart).
   */
  startDelayMs?: number;
}

/** Marks ONLINE devices STALE when they were silent for longer than their driver's `staleAfterMs`. */
export class LivenessJob {
  private static timer: NodeJS.Timeout | undefined;
  private static running = false;
  private static startDelayMs = 5_000;

  static start(opts: LivenessOptions = {}): void {
    if (LivenessJob.timer) return;
    LivenessJob.startDelayMs = opts.startDelayMs ?? 5_000;
    LivenessJob.timer = setInterval(() => {
      void LivenessJob.runOnce();
    }, opts.intervalMs ?? 10_000);
    LivenessJob.timer.unref();
  }

  static stop(): void {
    if (LivenessJob.timer) clearInterval(LivenessJob.timer);
    LivenessJob.timer = undefined;
  }

  /** One sweep. Returns the number of devices moved to STALE. */
  static async runOnce(now: Date = new Date()): Promise<number> {
    const connectedAt = MqttClient.firstConnectedAt;
    if (!connectedAt || now.getTime() - connectedAt.getTime() < LivenessJob.startDelayMs) return 0;
    if (LivenessJob.running) return 0;
    LivenessJob.running = true;
    try {
      let changed = 0;
      for (const type of Object.keys(DEVICE_TYPES) as DeviceType[]) {
        const staleAfterMs = DEVICE_TYPES[type].staleAfterMs;
        if (staleAfterMs === null) continue; // no heartbeat known: never STALE
        const cutoff = new Date(now.getTime() - staleAfterMs);
        const due = await prisma.deviceStatus.findMany({
          where: { type, liveness: "ONLINE", lastSeenAt: { lt: cutoff } },
          select: { deviceId: true },
        });
        for (const { deviceId } of due) {
          // Conditional update: skipped if a message arrived since the query.
          if (await DeviceStateService.markStaleIfSilent(deviceId, cutoff)) changed++;
        }
      }
      return changed;
    } catch (err) {
      logger.error("liveness sweep failed", { error: String(err) });
      return 0;
    } finally {
      LivenessJob.running = false;
    }
  }
}

export default LivenessJob;
