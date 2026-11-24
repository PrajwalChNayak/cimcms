import { describe, expect, it } from 'vitest';
import {
  MINUTES_PER_WEEK,
  configAppliedDataSchema,
  createScheduleBodySchema,
  findWindowOverlaps,
  istParts,
  scheduleRuleSchema,
  updateScheduleBodySchema,
  weekMinuteLabel,
  windowActiveAt,
  windowIntervals,
  type ScheduleWindow,
} from '../src/index.js';

const w = (days: number[], on: string, off: string): ScheduleWindow => ({ days, on, off });
const ALL = [1, 2, 3, 4, 5, 6, 7];

describe('windowIntervals (minutes of the week, Monday 00:00 = 0)', () => {
  it('same-day window', () => {
    expect(windowIntervals(w([1], '06:00', '18:00'))).toEqual([{ start: 360, end: 1080 }]);
    expect(windowIntervals(w([2], '00:00', '01:00'))).toEqual([{ start: 1440, end: 1500 }]);
  });

  it('a window with off < on ends on the next day', () => {
    expect(windowIntervals(w([1], '22:00', '06:00'))).toEqual([{ start: 1320, end: 1800 }]);
  });

  it('Sunday night wraps to Monday and is split in two intervals', () => {
    expect(windowIntervals(w([7], '22:00', '06:00'))).toEqual([
      { start: 6 * 1440 + 1320, end: MINUTES_PER_WEEK },
      { start: 0, end: 360 },
    ]);
  });

  it('on == off has no interval', () => {
    expect(windowIntervals(w([1], '08:00', '08:00'))).toEqual([]);
  });
});

describe('findWindowOverlaps', () => {
  it('finds no overlap for disjoint windows and for windows that only touch', () => {
    expect(findWindowOverlaps([w(ALL, '06:00', '12:00'), w(ALL, '12:00', '18:00')])).toEqual([]);
    expect(findWindowOverlaps([w(ALL, '06:00', '12:00'), w(ALL, '13:00', '18:00')])).toEqual([]);
    // evening to morning, then the day window: touches at 06:00
    expect(findWindowOverlaps([w(ALL, '22:00', '06:00'), w(ALL, '06:00', '18:00')])).toEqual([]);
  });

  it('reports overlapping windows with the first overlapping minute', () => {
    const found = findWindowOverlaps([w([1, 2], '06:00', '12:00'), w([2], '11:00', '14:00')]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ windowA: 0, windowB: 1, from: 1440 + 660, to: 1440 + 720 });
    expect(weekMinuteLabel(found[0]!.from)).toBe('Tue 11:00');
  });

  it('only windows on a shared day overlap', () => {
    expect(findWindowOverlaps([w([1], '06:00', '12:00'), w([2], '06:00', '12:00')])).toEqual([]);
  });

  it('a midnight-crossing window overlaps the next day\'s early window', () => {
    const found = findWindowOverlaps([w([1], '22:00', '06:00'), w([2], '05:00', '07:00')]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ windowA: 0, windowB: 1 });
  });

  it('wraps from Sunday to Monday', () => {
    const found = findWindowOverlaps([w([7], '22:00', '06:00'), w([1], '05:00', '07:00')]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ from: 300, to: 360 });
    // Saturday night does not reach Monday
    expect(findWindowOverlaps([w([6], '22:00', '06:00'), w([1], '05:00', '07:00')])).toEqual([]);
  });

  it('a window is not reported against itself', () => {
    expect(findWindowOverlaps([w(ALL, '06:00', '18:00')])).toEqual([]);
  });

  it('a window that crosses midnight every day does not overlap itself', () => {
    expect(findWindowOverlaps([w(ALL, '23:00', '23:30')])).toEqual([]);
    expect(findWindowOverlaps([w(ALL, '23:59', '23:58')])).toEqual([]); // 23h59m: never reaches its own next start
  });
});

describe('windowActiveAt', () => {
  it('same-day window is half open', () => {
    const win = w([1], '06:00', '18:00');
    expect(windowActiveAt(win, 1, 359)).toBe(false);
    expect(windowActiveAt(win, 1, 360)).toBe(true);
    expect(windowActiveAt(win, 1, 1079)).toBe(true);
    expect(windowActiveAt(win, 1, 1080)).toBe(false);
    expect(windowActiveAt(win, 2, 400)).toBe(false);
  });

  it('midnight-crossing window: evening on its day, morning on the next day', () => {
    const win = w([7], '22:00', '06:00');
    expect(windowActiveAt(win, 7, 1320)).toBe(true);
    expect(windowActiveAt(win, 7, 100)).toBe(false); // Sunday early morning belongs to Saturday's window
    expect(windowActiveAt(win, 1, 100)).toBe(true); // Monday early morning: Sunday's window
    expect(windowActiveAt(win, 1, 360)).toBe(false);
  });
});

describe('istParts', () => {
  it('converts UTC to IST day, minute and date', () => {
    // Monday 2026-11-23 18:45 UTC = Tuesday 2026-11-24 00:15 IST
    expect(istParts(new Date('2026-11-23T18:45:00Z'))).toEqual({
      isoDay: 2,
      minuteOfDay: 15,
      date: '2026-11-24',
    });
    // Sunday maps to 7
    expect(istParts(new Date('2026-11-22T05:00:00Z')).isoDay).toBe(7);
  });
});

describe('schedule REST schemas', () => {
  const base = { roomId: '00000000-0000-4000-8000-000000000001', name: 'Daily', effectiveFrom: '2026-11-22' };
  const rule = { days: [1, 2], on: '06:00', off: '18:00' };

  it('accepts a valid schedule', () => {
    expect(createScheduleBodySchema.safeParse({ ...base, rules: [rule] }).success).toBe(true);
    expect(
      createScheduleBodySchema.safeParse({ ...base, rules: [rule], effectiveTo: '2026-12-01' }).success,
    ).toBe(true);
  });

  it('rejects on == off, empty or duplicate days, bad times and more than 8 windows', () => {
    expect(scheduleRuleSchema.safeParse({ ...rule, off: '06:00' }).success).toBe(false);
    expect(scheduleRuleSchema.safeParse({ ...rule, days: [] }).success).toBe(false);
    expect(scheduleRuleSchema.safeParse({ ...rule, days: [1, 1] }).success).toBe(false);
    expect(scheduleRuleSchema.safeParse({ ...rule, days: [8] }).success).toBe(false);
    expect(scheduleRuleSchema.safeParse({ ...rule, on: '6:00' }).success).toBe(false);
    expect(scheduleRuleSchema.safeParse({ ...rule, off: '24:00' }).success).toBe(false);
    expect(createScheduleBodySchema.safeParse({ ...base, rules: [] }).success).toBe(false);
    const nine = Array.from({ length: 9 }, () => rule);
    expect(createScheduleBodySchema.safeParse({ ...base, rules: nine }).success).toBe(false);
  });

  it('rejects impossible dates and an end before the start', () => {
    expect(createScheduleBodySchema.safeParse({ ...base, effectiveFrom: '2026-02-30', rules: [rule] }).success).toBe(false);
    expect(
      createScheduleBodySchema.safeParse({ ...base, rules: [rule], effectiveTo: '2026-11-01' }).success,
    ).toBe(false);
  });

  it('update needs at least one field', () => {
    expect(updateScheduleBodySchema.safeParse({}).success).toBe(false);
    expect(updateScheduleBodySchema.safeParse({ name: 'x' }).success).toBe(true);
    expect(updateScheduleBodySchema.safeParse({ effectiveTo: null }).success).toBe(true);
  });
});

describe('CONFIG_APPLIED data', () => {
  it('validates the event payload', () => {
    expect(configAppliedDataSchema.safeParse({ config_version: 3, result: 'APPLIED' }).success).toBe(true);
    expect(configAppliedDataSchema.safeParse({ config_version: 3, result: 'REJECTED', reason: 'NVS_FULL' }).success).toBe(true);
    expect(configAppliedDataSchema.safeParse({ config_version: 3, result: 'MAYBE' }).success).toBe(false);
  });
});
