import { z } from 'zod';
import { LIVENESS } from '../constants.js';
import { deviceConfigDtoSchema, scheduleRuleDtoSchema } from './schedules.js';

const iso = z.string().datetime();

export const EXPERIMENT_STATUSES = [
  'DRAFT',
  'READY',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'STOPPED',
] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const experimentAssignmentDtoSchema = z.object({
  groupLabel: z.string(),
  deviceId: z.string(),
  relay: z.number().int(),
  windows: z.array(scheduleRuleDtoSchema),
});
export type ExperimentAssignmentDto = z.infer<typeof experimentAssignmentDtoSchema>;

export const experimentDtoSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(EXPERIMENT_STATUSES),
  startsAt: iso,
  endsAt: iso,
  createdByEmail: z.string().nullable(),
  assignments: z.array(experimentAssignmentDtoSchema),
  createdAt: iso,
  updatedAt: iso,
});
export type ExperimentDto = z.infer<typeof experimentDtoSchema>;

/** Per device of an experiment: latest config and live state. */
export const experimentDeviceStatusDtoSchema = z.object({
  deviceId: z.string(),
  relays: z.array(z.number().int()),
  liveness: z.enum(LIVENESS),
  mode: z.string().nullable(),
  /** Latest config sent to the device; the experiment block is in it when `carriesExperiment`. */
  config: deviceConfigDtoSchema.nullable(),
  carriesExperiment: z.boolean(),
});
export type ExperimentDeviceStatusDto = z.infer<typeof experimentDeviceStatusDtoSchema>;

/** A device that could not be reached while changing an experiment (stop, pause, ...). */
export const experimentWarningDtoSchema = z.object({
  deviceId: z.string(),
  code: z.string(),
  message: z.string(),
});
export type ExperimentWarningDto = z.infer<typeof experimentWarningDtoSchema>;

export const experimentActionResultDtoSchema = z.object({
  experiment: experimentDtoSchema,
  configs: z.array(deviceConfigDtoSchema),
  /** Command ids of the SET_MODE commands sent to the devices. */
  commandIds: z.array(z.string()),
  warnings: z.array(experimentWarningDtoSchema),
});
export type ExperimentActionResultDto = z.infer<typeof experimentActionResultDtoSchema>;

export const experimentLogEntryDtoSchema = z.object({
  at: iso,
  source: z.enum(['AUDIT', 'DEVICE']),
  type: z.string(),
  deviceId: z.string().nullable(),
  actorEmail: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
});
export type ExperimentLogEntryDto = z.infer<typeof experimentLogEntryDtoSchema>;

/** `experiment:updated` socket payload. */
export interface ExperimentUpdatedData {
  experimentId: string;
  code: string;
  status: ExperimentStatus;
}
