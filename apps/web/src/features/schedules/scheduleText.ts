import type { DeviceConfigDto, ScheduleDto } from "@cimcms/contracts";

/** UI texts of the schedule editor (T5.3). Times are IST. */
export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const SCHEDULE_STATUS_TEXT: Record<ScheduleDto["status"], string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export const CONFIG_STATUS_TEXT = (c: Pick<DeviceConfigDto, "status" | "reason">): string => {
  switch (c.status) {
    case "PUBLISHED":
      return "Sent — waiting for the device to confirm";
    case "APPLIED":
      return "Applied by the device";
    case "REJECTED":
      return `Rejected by the device: ${c.reason ?? "unknown reason"}`;
  }
};

export const NO_CONFIG_TEXT = "Nothing has been sent to this device yet";
export const NO_RELAYS_TEXT =
  "This room has no relays assigned yet, so publishing sends nothing to a device.";
export const TIMES_ARE_IST = "All times are Indian Standard Time (IST).";
export const UNSAVED_TEXT = "You have unsaved changes. Save the draft before publishing.";
export const NOTHING_TO_PUBLISH_TEXT = "The latest version is already published. Edit the schedule to publish a change.";

export const publishConfirmTitle = (name: string): string => `Publish schedule "${name}"?`;
export const publishConfirmBody = (devices: number): string =>
  devices === 0
    ? "No device carries relays of this room, so nothing will be sent."
    : `The schedule is sent to ${devices} device${devices === 1 ? "" : "s"}. A device runs it in AUTO mode once it confirms.`;
