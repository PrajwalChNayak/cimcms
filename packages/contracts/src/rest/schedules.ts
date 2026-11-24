import { z } from 'zod';
import { SCHEDULE_STATUSES } from '../dto/schedules.js';
import { findWindowOverlaps } from '../schedule.js';
import { idSchema } from './ids.js';
import { pageQuerySchema } from './index.js';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
/** A real calendar day, YYYY-MM-DD. */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a valid date');

/** One window of a schedule rule: unique ISO days, on != off. */
export const scheduleRuleSchema = z
  .object({
    days: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .refine((d) => new Set(d).size === d.length, 'Days must be unique'),
    on: hhmm,
    off: hhmm,
  })
  .refine((w) => w.on !== w.off, { message: 'on and off must differ', path: ['off'] });
export type ScheduleRuleInput = z.infer<typeof scheduleRuleSchema>;

/** Max windows per relay (config wire limit). */
export const MAX_WINDOWS_PER_CHANNEL = 8;

export const scheduleRulesSchema = z.array(scheduleRuleSchema).min(1).max(MAX_WINDOWS_PER_CHANNEL);

const dateRange = (b: { effectiveFrom?: string; effectiveTo?: string | null }): boolean =>
  !b.effectiveFrom || !b.effectiveTo || b.effectiveFrom <= b.effectiveTo;

export const createScheduleBodySchema = z
  .object({
    roomId: idSchema,
    name: z.string().trim().min(1).max(80),
    rules: scheduleRulesSchema,
    effectiveFrom: dateOnlySchema,
    effectiveTo: dateOnlySchema.nullable().optional(),
  })
  .refine(dateRange, { message: 'effectiveTo is before effectiveFrom', path: ['effectiveTo'] });
export type CreateScheduleBody = z.infer<typeof createScheduleBodySchema>;

export const updateScheduleBodySchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    rules: scheduleRulesSchema.optional(),
    effectiveFrom: dateOnlySchema.optional(),
    effectiveTo: dateOnlySchema.nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field is required' })
  .refine(dateRange, { message: 'effectiveTo is before effectiveFrom', path: ['effectiveTo'] });
export type UpdateScheduleBody = z.infer<typeof updateScheduleBodySchema>;

export const scheduleListQuerySchema = pageQuerySchema.extend({
  roomId: idSchema.optional(),
  status: z.enum(SCHEDULE_STATUSES).optional(),
});
export type ScheduleListQuery = z.infer<typeof scheduleListQuerySchema>;

/** True when the rules of one relay overlap (shared by the editor and the API). */
export const rulesOverlap = (rules: readonly ScheduleRuleInput[]): boolean =>
  findWindowOverlaps(rules).length > 0;
