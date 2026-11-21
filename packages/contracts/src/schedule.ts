import { TZ_OFFSET_MINUTES } from './constants.js';

/** One on/off window as in the config wire format (days ISO 1=Mon..7=Sun, times HH:MM in IST). */
export interface ScheduleWindow {
  days: number[];
  on: string;
  off: string;
}

export const MINUTES_PER_DAY = 1440;
/** A week in minutes; Monday 00:00 is minute 0. */
export const MINUTES_PER_WEEK = 10080;

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

export interface Interval {
  /** Start minute in the week (inclusive). */
  start: number;
  /** End minute in the week (exclusive). */
  end: number;
}

/**
 * Minute intervals of one window inside the week 0..10080. A window with `off < on` ends on
 * the next day; the Sunday one wraps to Monday and is split in two intervals. `on == off` has no interval.
 */
export function windowIntervals(w: ScheduleWindow): Interval[] {
  const on = hhmmToMinutes(w.on);
  const off = hhmmToMinutes(w.off);
  if (on === off) return [];
  const length = off > on ? off - on : MINUTES_PER_DAY - on + off;
  const out: Interval[] = [];
  for (const day of w.days) {
    const start = (day - 1) * MINUTES_PER_DAY + on;
    const end = start + length;
    if (end <= MINUTES_PER_WEEK) {
      out.push({ start, end });
    } else {
      out.push({ start, end: MINUTES_PER_WEEK }, { start: 0, end: end - MINUTES_PER_WEEK });
    }
  }
  return out;
}

export interface WindowOverlap {
  /** Index of the first window in the list. */
  windowA: number;
  /** Index of the second window (may equal windowA when a window overlaps itself). */
  windowB: number;
  /** First overlapping minute of the week and the end of the overlap. */
  from: number;
  to: number;
}

/**
 * All pairs of windows (of ONE relay) whose minute intervals overlap. Windows that merely
 * touch (one ends when the next starts) do not overlap.
 */
export function findWindowOverlaps(windows: readonly ScheduleWindow[]): WindowOverlap[] {
  const all = windows.map((w) => windowIntervals(w));
  const found: WindowOverlap[] = [];
  for (let a = 0; a < all.length; a++) {
    for (let b = a; b < all.length; b++) {
      let hit: WindowOverlap | null = null;
      for (const x of all[a] ?? []) {
        for (const y of all[b] ?? []) {
          if (a === b && x === y) continue;
          const from = Math.max(x.start, y.start);
          const to = Math.min(x.end, y.end);
          if (from < to && (hit === null || from < hit.from)) {
            hit = { windowA: a, windowB: b, from, to };
          }
        }
      }
      if (hit) found.push(hit);
    }
  }
  return found;
}

/** `Mon 06:00` style text of a week minute (for validation messages). */
export function weekMinuteLabel(minute: number): string {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const day = Math.floor(minute / MINUTES_PER_DAY) % 7;
  const inDay = minute % MINUTES_PER_DAY;
  const hh = String(Math.floor(inDay / 60)).padStart(2, '0');
  const mm = String(inDay % 60).padStart(2, '0');
  return `${names[day]} ${hh}:${mm}`;
}

/** Is the window running at this instant? `isoDay` 1=Mon..7=Sun, `minuteOfDay` 0..1439 (both IST). */
export function windowActiveAt(w: ScheduleWindow, isoDay: number, minuteOfDay: number): boolean {
  const on = hhmmToMinutes(w.on);
  const off = hhmmToMinutes(w.off);
  if (on === off) return false;
  if (off > on) return w.days.includes(isoDay) && minuteOfDay >= on && minuteOfDay < off;
  // Crosses midnight: the evening part belongs to `isoDay`, the morning part to the day before.
  const previous = isoDay === 1 ? 7 : isoDay - 1;
  return (
    (w.days.includes(isoDay) && minuteOfDay >= on) ||
    (w.days.includes(previous) && minuteOfDay < off)
  );
}

/** IST calendar parts of an instant: ISO weekday, minute of day and the YYYY-MM-DD date. */
export function istParts(at: Date): { isoDay: number; minuteOfDay: number; date: string } {
  const shifted = new Date(at.getTime() + TZ_OFFSET_MINUTES * 60_000);
  const jsDay = shifted.getUTCDay(); // 0=Sun
  return {
    isoDay: jsDay === 0 ? 7 : jsDay,
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    date: shifted.toISOString().slice(0, 10),
  };
}
