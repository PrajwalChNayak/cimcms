import type { CommandDto } from "@cimcms/contracts";

/**
 * Exact UI texts from plan section 9 (FRS acceptance #5, #9, #12).
 * Never use "lamp on", "light is on" or a lit-bulb icon for relay state.
 */
export const SIMULATION_BANNER =
  "SIMULATION MODE — relays are not energised. States shown are logical (commanded) states, not lamp output.";

export const relayLabel = (on: boolean, simulation: boolean): string =>
  simulation
    ? on
      ? "Logical: ON"
      : "Logical: OFF"
    : on
      ? "Relay: ON (no lamp feedback)"
      : "Relay: OFF";

export const PENDING_TEXT = "Pending — waiting for device…";
export const OFFLINE_TEXT = "Device offline — commands disabled";
export const STALE_TEXT = "No recent data from device — commands disabled";
export const modeBlockedText = (mode: string): string =>
  `Device is in ${mode} mode — manual commands are disabled`;

export const bulkConfirmTitle = (on: boolean, deviceId: string): string =>
  `Turn ALL 16 relays ${on ? "ON" : "OFF"} on ${deviceId}?`;
export const BULK_CANCEL = "Cancel";
export const bulkConfirmButton = (on: boolean): string =>
  `Turn all ${on ? "ON" : "OFF"}`;

export const commandStatusText = (
  command: Pick<CommandDto, "status" | "reason" | "lateResult">,
): string => {
  switch (command.status) {
    case "PENDING":
    case "PUBLISHED":
    case "ACCEPTED":
      return PENDING_TEXT;
    case "EXECUTED":
      return "Done";
    case "REJECTED":
      return `Rejected: ${command.reason ?? "unknown reason"}`;
    case "EXPIRED":
      return "Expired before the device ran it";
    case "TIMEOUT":
      return command.lateResult
        ? `No reply from device — device later reported ${command.lateResult}`
        : "No reply from device";
    case "FAILED":
      return "Device reported a failure";
    case "PUBLISH_FAILED":
      return "Could not reach the message broker";
    case "DUPLICATE":
      return "Duplicate — ignored by device";
  }
};
