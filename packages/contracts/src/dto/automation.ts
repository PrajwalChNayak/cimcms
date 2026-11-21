import { z } from 'zod';

/** Why a mode cannot be entered yet. Stable codes; the UI maps them to text. */
export const READINESS_REASONS = [
  'NO_CONFIG',
  'CONFIG_NOT_APPLIED',
  'CONFIG_REJECTED',
  'NO_AUTO_SCHEDULE',
  'NOT_YET_EFFECTIVE',
  'EFFECTIVE_PERIOD_ENDED',
  'DEVICE_NOT_READY',
  'NO_READY_EXPERIMENT',
  'EXPERIMENT_CONFIG_NOT_APPLIED',
] as const;
export type ReadinessReason = (typeof READINESS_REASONS)[number];

const reasons = z.array(z.enum(READINESS_REASONS));

export const deviceReadinessDtoSchema = z.object({
  deviceId: z.string(),
  auto: z.object({
    ready: z.boolean(),
    reasons,
    configVersion: z.number().int().nullable(),
    effectiveFrom: z.string().nullable(),
    effectiveTo: z.string().nullable(),
  }),
  experiment: z.object({
    ready: z.boolean(),
    reasons,
    experimentId: z.string().nullable(),
    experimentCode: z.string().nullable(),
  }),
});
export type DeviceReadinessDto = z.infer<typeof deviceReadinessDtoSchema>;
