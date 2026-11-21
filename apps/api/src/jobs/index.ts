import { CommandTimeoutJob } from "./commandTimeout.job";

/** Starts all background jobs (one process only, D-3). T2.10 adds liveness and retention. */
export function startJobs(): void {
  CommandTimeoutJob.start();
}

export function stopJobs(): void {
  CommandTimeoutJob.stop();
}
