import type { ExperimentDto, ExperimentWarningDto } from "@cimcms/contracts";
import type { ExperimentAction } from "@api/experimentApi";

/** UI texts of the experiment pages (T5.4). Times are IST. */
export const EXPERIMENT_STATUS_TEXT: Record<ExperimentDto["status"], string> = {
  DRAFT: "Draft",
  READY: "Ready",
  RUNNING: "Running",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  STOPPED: "Stopped",
};

export const TIMES_ARE_IST = "All times are Indian Standard Time (IST).";

// TODO(owner-decision O-15): pause / stop semantics are a default until the owner confirms them.
export const ACTION_CONFIRM: Record<ExperimentAction, { title: (code: string) => string; body: string; button: string }> = {
  ready: {
    title: (c) => `Make experiment ${c} ready?`,
    body: "The programme is sent to the devices. Nothing runs yet: you start the experiment when every device has confirmed it.",
    button: "Make ready",
  },
  revert: {
    title: (c) => `Return experiment ${c} to draft?`,
    body: "The programme is removed from the devices so you can edit it again.",
    button: "Return to draft",
  },
  resend: {
    title: (c) => `Send the programme of ${c} again?`,
    body: "The programme is sent to every device of the experiment again.",
    button: "Send again",
  },
  start: {
    title: (c) => `Start experiment ${c}?`,
    body: "The devices switch to EXPERIMENT mode. Relays that are not part of the experiment are switched OFF and manual relay commands are disabled while it runs.",
    button: "Start experiment",
  },
  pause: {
    title: (c) => `Pause experiment ${c}?`,
    body: "The devices switch to MAINTENANCE mode. The experiment programme stops until you resume it.",
    button: "Pause experiment",
  },
  resume: {
    title: (c) => `Resume experiment ${c}?`,
    body: "The devices switch back to EXPERIMENT mode.",
    button: "Resume experiment",
  },
  stop: {
    title: (c) => `Stop experiment ${c}?`,
    body: "The devices return to MANUAL mode and the programme is removed from them. A stopped experiment cannot be started again.",
    button: "Stop experiment",
  },
};

export const ACTION_DONE: Record<ExperimentAction, string> = {
  ready: "The programme was sent. Waiting for the devices to confirm it.",
  revert: "The experiment is a draft again.",
  resend: "The programme was sent again.",
  start: "The experiment is running.",
  pause: "The experiment is paused.",
  resume: "The experiment is running again.",
  stop: "The experiment was stopped.",
};

export const warningText = (w: ExperimentWarningDto): string => `${w.deviceId}: ${w.message}`;

export const REASON_TEXT: Record<string, string> = {
  EXPERIMENT_CONFIG_NOT_APPLIED: "has not confirmed the programme yet",
  NO_READY_EXPERIMENT: "does not hold this experiment",
  DEVICE_OFFLINE: "is offline",
  DEVICE_STALE: "has not sent data recently",
};

export const CONFIG_STATE_TEXT = (c: { status: string; reason: string | null }): string => {
  switch (c.status) {
    case "PUBLISHED":
      return "Sent, waiting for confirmation";
    case "APPLIED":
      return "Confirmed by the device";
    case "REJECTED":
      return `Rejected by the device: ${c.reason ?? "unknown reason"}`;
    default:
      return c.status;
  }
};
