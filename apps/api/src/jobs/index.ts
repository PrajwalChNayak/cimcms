import { CommandTimeoutJob } from "./commandTimeout.job";
import { ExperimentJob } from "./experiment.job";
import { LivenessJob } from "./liveness.job";
import { RetentionJob } from "./retention.job";

/**
 * Starts all background jobs (one process only, D-3). Call after `startMqtt()` was kicked off:
 * the command-timeout and liveness jobs wait on their own until the MQTT client has connected.
 */
export function startJobs(): void {
  CommandTimeoutJob.start();
  LivenessJob.start();
  RetentionJob.start();
  ExperimentJob.start();
}

export function stopJobs(): void {
  CommandTimeoutJob.stop();
  LivenessJob.stop();
  RetentionJob.stop();
  ExperimentJob.stop();
}
