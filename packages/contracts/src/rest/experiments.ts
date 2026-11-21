import { z } from 'zod';
import { EXPERIMENT_STATUSES } from '../dto/experiments.js';
import { deviceIdSchema, relayNo } from '../mqtt/primitives.js';
import { pageQuerySchema } from './index.js';
import { scheduleRulesSchema } from './schedules.js';

export const experimentCodeSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/);

export const experimentAssignmentSchema = z.object({
  groupLabel: z.string().trim().min(1).max(40),
  deviceId: deviceIdSchema,
  relay: relayNo,
  windows: scheduleRulesSchema,
});
export type ExperimentAssignmentInput = z.infer<typeof experimentAssignmentSchema>;

const assignments = z.array(experimentAssignmentSchema).min(1).max(64);
const instants = (b: { startsAt?: string; endsAt?: string }): boolean =>
  !b.startsAt || !b.endsAt || Date.parse(b.startsAt) < Date.parse(b.endsAt);

export const createExperimentBodySchema = z
  .object({
    code: experimentCodeSchema,
    title: z.string().trim().min(1).max(120),
    description: z.string().max(1000).optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    assignments,
  })
  .refine(instants, { message: 'endsAt must be after startsAt', path: ['endsAt'] });
export type CreateExperimentBody = z.infer<typeof createExperimentBodySchema>;

/** Only a DRAFT experiment can be edited. The code never changes. */
export const updateExperimentBodySchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(1000).nullable().optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    assignments: assignments.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field is required' })
  .refine(instants, { message: 'endsAt must be after startsAt', path: ['endsAt'] });
export type UpdateExperimentBody = z.infer<typeof updateExperimentBodySchema>;

export const experimentListQuerySchema = pageQuerySchema.extend({
  status: z.enum(EXPERIMENT_STATUSES).optional(),
});
export type ExperimentListQuery = z.infer<typeof experimentListQuerySchema>;
