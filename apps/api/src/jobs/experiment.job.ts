import ExperimentService from "@services/experiment.service";
import logger from "@utils/logger.utils";

export interface ExperimentJobOptions {
  /** Sweep period (default 30 s). */
  intervalMs?: number;
}

/** Completes experiments whose period is over: devices go back to MANUAL and lose the experiment block. */
export class ExperimentJob {
  private static timer: NodeJS.Timeout | undefined;
  private static running = false;

  static start(opts: ExperimentJobOptions = {}): void {
    if (ExperimentJob.timer) return;
    ExperimentJob.timer = setInterval(() => {
      void ExperimentJob.runOnce();
    }, opts.intervalMs ?? 30_000);
    ExperimentJob.timer.unref();
  }

  static stop(): void {
    if (ExperimentJob.timer) clearInterval(ExperimentJob.timer);
    ExperimentJob.timer = undefined;
  }

  /** One sweep. Returns the number of experiments completed. */
  static async runOnce(now: Date = new Date()): Promise<number> {
    if (ExperimentJob.running) return 0;
    ExperimentJob.running = true;
    try {
      let done = 0;
      for (const id of await ExperimentService.dueForCompletion(now)) {
        try {
          if (await ExperimentService.complete(id)) done++;
        } catch (err) {
          logger.error("experiment completion failed", { id, error: String(err) });
        }
      }
      return done;
    } catch (err) {
      logger.error("experiment sweep failed", { error: String(err) });
      return 0;
    } finally {
      ExperimentJob.running = false;
    }
  }
}

export default ExperimentJob;
