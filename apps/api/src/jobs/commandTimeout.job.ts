import MqttClient from "@/mqtt/mqtt.client";
import CommandService from "@services/command.service";
import logger from "@utils/logger.utils";

export interface CommandTimeoutOptions {
  /** Sweep period. Plan: 2 s. */
  intervalMs?: number;
  /** Do not sweep until the MQTT client has been connected this long (lets acks queued during a restart arrive). Plan: 10 s. */
  startDelayMs?: number;
}

/** Marks commands TIMEOUT once expiry + grace has passed (plan section 8, rules 4-5). */
export class CommandTimeoutJob {
  private static timer: NodeJS.Timeout | undefined;
  private static running = false;
  private static startDelayMs = 10_000;

  static start(opts: CommandTimeoutOptions = {}): void {
    if (CommandTimeoutJob.timer) return;
    CommandTimeoutJob.startDelayMs = opts.startDelayMs ?? 10_000;
    CommandTimeoutJob.timer = setInterval(() => {
      void CommandTimeoutJob.runOnce();
    }, opts.intervalMs ?? 2_000);
    CommandTimeoutJob.timer.unref();
  }

  static stop(): void {
    if (CommandTimeoutJob.timer) clearInterval(CommandTimeoutJob.timer);
    CommandTimeoutJob.timer = undefined;
  }

  /** One sweep. Returns the number of commands moved to TIMEOUT (0 while the start delay runs). */
  static async runOnce(now: Date = new Date()): Promise<number> {
    const connectedAt = MqttClient.firstConnectedAt;
    if (!connectedAt || now.getTime() - connectedAt.getTime() <= CommandTimeoutJob.startDelayMs) {
      return 0;
    }
    if (CommandTimeoutJob.running) return 0; // a slow sweep must not overlap the next tick
    CommandTimeoutJob.running = true;
    try {
      return await CommandService.timeoutExpired(now);
    } catch (err) {
      logger.error("command timeout sweep failed", { error: String(err) });
      return 0;
    } finally {
      CommandTimeoutJob.running = false;
    }
  }
}

export default CommandTimeoutJob;
