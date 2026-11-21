import { LED_CHANNEL_COUNT } from "@cimcms/contracts";
import { newWindow, validateWindows, type WindowDraft } from "@features/schedules/scheduleValidation";
import { istLocalToUtcIso } from "@shared/utils/time";

export interface AssignmentDraft {
  key: string;
  groupLabel: string;
  deviceId: string;
  relay: number;
  windows: WindowDraft[];
}

export interface ExperimentDraft {
  code: string;
  title: string;
  description: string;
  /** `datetime-local` value, IST wall-clock time. */
  startsAt: string;
  endsAt: string;
  rows: AssignmentDraft[];
}

const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

let counter = 0;
export const newRow = (over: Partial<AssignmentDraft> = {}): AssignmentDraft => ({
  key: `r${++counter}`,
  groupLabel: "",
  deviceId: "",
  relay: 1,
  windows: [newWindow()],
  ...over,
});

/** Messages that block saving; empty when valid. Same rules as the API. */
export function validateExperiment(d: ExperimentDraft, now: number = Date.now()): string[] {
  const out: string[] = [];
  if (!CODE_RE.test(d.code)) out.push("Enter a code (letters, digits, dash, underscore; max 32).");
  if (!d.title.trim()) out.push("Enter a title.");
  const from = istLocalToUtcIso(d.startsAt);
  const to = istLocalToUtcIso(d.endsAt);
  if (!from) out.push("Enter the start date and time.");
  if (!to) out.push("Enter the end date and time.");
  if (from && to) {
    if (Date.parse(to) <= Date.parse(from)) out.push("The end must be after the start.");
    else if (Date.parse(to) <= now) out.push("The experiment must end in the future.");
  }
  if (d.rows.length === 0) out.push("Add at least one relay to the experiment.");
  const seen = new Set<string>();
  d.rows.forEach((r, i) => {
    const prefix = `Row ${i + 1}: `;
    if (!r.groupLabel.trim()) out.push(`${prefix}enter a group label.`);
    if (!r.deviceId) out.push(`${prefix}choose a device.`);
    if (!Number.isInteger(r.relay) || r.relay < 1 || r.relay > LED_CHANNEL_COUNT) {
      out.push(`${prefix}relay must be 1 to ${LED_CHANNEL_COUNT}.`);
    }
    const key = `${r.deviceId}#${r.relay}`;
    if (r.deviceId && seen.has(key)) out.push(`${prefix}relay ${r.relay} of ${r.deviceId} is used twice.`);
    seen.add(key);
    out.push(...validateWindows(r.windows, prefix));
  });
  return out;
}
