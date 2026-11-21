import type { Mode, ReadinessReason } from "@cimcms/contracts";

/** UI texts of the operating-mode page (T5.2). Not part of plan section 9. */
export const MODE_LABEL: Record<Mode, string> = {
  MANUAL: "Manual",
  MAINTENANCE: "Maintenance",
  AUTO: "Auto (schedule)",
  EXPERIMENT: "Experiment",
};

export const MODE_DESCRIPTION: Record<Mode, string> = {
  MANUAL: "Relays change only when an operator sends a command or uses the keypad.",
  MAINTENANCE: "For service work. Only users with diagnostics rights can switch relays.",
  AUTO: "The device runs the published schedule on its own. Manual relay commands are disabled.",
  EXPERIMENT: "The device runs the experiment programme. Manual relay commands are disabled.",
};

export const READINESS_TEXT: Record<ReadinessReason, string> = {
  NO_CONFIG: "No schedule has been sent to this device yet",
  CONFIG_NOT_APPLIED: "The device has not confirmed the latest configuration yet",
  CONFIG_REJECTED: "The device rejected the latest configuration",
  NO_AUTO_SCHEDULE: "No published schedule covers this device",
  NOT_YET_EFFECTIVE: "The schedule starts on a later date",
  EFFECTIVE_PERIOD_ENDED: "The schedule's effective period has ended",
  DEVICE_NOT_READY: "The device reports it is not ready for AUTO",
  NO_READY_EXPERIMENT: "No experiment is ready for this device",
  EXPERIMENT_CONFIG_NOT_APPLIED: "The device has not confirmed the experiment configuration yet",
};

export const modeConfirmTitle = (deviceId: string, mode: Mode): string =>
  `Switch ${deviceId} to ${MODE_LABEL[mode]} mode?`;

export const modeConfirmBody = (mode: Mode): string => {
  switch (mode) {
    case "AUTO":
      return "Relays will follow the published schedule. Manual relay commands will be disabled until you switch back.";
    case "EXPERIMENT":
      return "Relays will follow the experiment programme. Relays that are not part of the experiment stay OFF. Manual relay commands will be disabled.";
    case "MAINTENANCE":
      return "Schedules pause while the device is in maintenance. Remember to switch back when the work is done.";
    case "MANUAL":
      return "Automatic programmes stop. Relays keep their current state until a command changes them.";
  }
};

export const MODE_CONFIRM_BUTTON = (mode: Mode): string => `Switch to ${MODE_LABEL[mode]}`;
export const MODE_CANCEL = "Cancel";
export const MODE_NO_PERMISSION = "You do not have permission to change the operating mode";
export const TECHNICIAN_MODE_LIMIT =
  "Technicians can only enter and leave Maintenance mode";
export const MODE_SUBMIT_FAILED = "Mode change was not sent";
