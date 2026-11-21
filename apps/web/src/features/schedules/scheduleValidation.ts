import {
  findWindowOverlaps,
  MAX_WINDOWS_PER_CHANNEL,
  weekMinuteLabel,
  type ScheduleWindow,
} from "@cimcms/contracts";

export interface WindowDraft extends ScheduleWindow {
  /** Stable key for React lists. */
  key: string;
}

export interface ScheduleDraft {
  name: string;
  windows: WindowDraft[];
  effectiveFrom: string;
  effectiveTo: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Per-window checks plus the overlap check of the windows of ONE relay. `prefix` e.g. "Row 2: ". */
export function validateWindows(windows: WindowDraft[], prefix = ""): string[] {
  const out: string[] = [];
  if (windows.length === 0) out.push(`${prefix}Add at least one on/off window.`);
  if (windows.length > MAX_WINDOWS_PER_CHANNEL) {
    out.push(`${prefix}At most ${MAX_WINDOWS_PER_CHANNEL} windows are allowed.`);
  }
  windows.forEach((w, i) => {
    const n = i + 1;
    if (w.days.length === 0) out.push(`${prefix}Window ${n}: choose at least one day.`);
    if (!TIME_RE.test(w.on) || !TIME_RE.test(w.off)) {
      out.push(`${prefix}Window ${n}: enter an on and an off time.`);
    } else if (w.on === w.off) {
      out.push(`${prefix}Window ${n}: on and off time must be different.`);
    }
  });
  // Overlap is only checked for windows that are valid on their own.
  const usable = windows.filter(
    (w) => w.days.length > 0 && TIME_RE.test(w.on) && TIME_RE.test(w.off) && w.on !== w.off,
  );
  for (const o of findWindowOverlaps(usable)) {
    const a = windows.indexOf(usable[o.windowA] as WindowDraft) + 1;
    const b = windows.indexOf(usable[o.windowB] as WindowDraft) + 1;
    out.push(
      `${prefix}Windows ${a} and ${b} overlap (${weekMinuteLabel(o.from)} to ${weekMinuteLabel(o.to)}).`,
    );
  }
  return out;
}

/** Messages that block saving; empty when the draft is valid. Same rules as the API. */
export function validateDraft(d: ScheduleDraft): string[] {
  const out: string[] = [];
  if (!d.name.trim()) out.push("Enter a name for the schedule.");
  out.push(...validateWindows(d.windows));
  if (!DATE_RE.test(d.effectiveFrom)) out.push("Enter the first day the schedule applies.");
  if (d.effectiveTo && !DATE_RE.test(d.effectiveTo)) out.push("The last day is not a valid date.");
  if (d.effectiveTo && DATE_RE.test(d.effectiveFrom) && d.effectiveTo < d.effectiveFrom) {
    out.push("The last day is before the first day.");
  }
  return out;
}

let counter = 0;
export const newWindow = (over: Partial<ScheduleWindow> = {}): WindowDraft => ({
  key: `w${++counter}`,
  days: [1, 2, 3, 4, 5, 6, 7],
  on: "06:00",
  off: "18:00",
  ...over,
});

export const draftRules = (d: ScheduleDraft): ScheduleWindow[] =>
  d.windows.map((w) => ({ days: [...w.days].sort((a, b) => a - b), on: w.on, off: w.off }));
