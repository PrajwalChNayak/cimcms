import { z } from 'zod';

const iso = z.string().datetime();

export const SCHEDULE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];
export const DEVICE_CONFIG_STATUSES = ['PUBLISHED', 'APPLIED', 'REJECTED'] as const;
export type DeviceConfigStatus = (typeof DEVICE_CONFIG_STATUSES)[number];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const scheduleRuleDtoSchema = z.object({
  days: z.array(z.number().int().min(1).max(7)).min(1),
  on: hhmm,
  off: hhmm,
});
export type ScheduleRuleDto = z.infer<typeof scheduleRuleDtoSchema>;

export const scheduleVersionDtoSchema = z.object({
  version: z.number().int(),
  rules: z.array(scheduleRuleDtoSchema),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  createdByEmail: z.string().nullable(),
  createdAt: iso,
  publishedAt: iso.nullable(),
});
export type ScheduleVersionDto = z.infer<typeof scheduleVersionDtoSchema>;

export const scheduleDtoSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  roomCode: z.string().nullable(),
  roomName: z.string().nullable(),
  name: z.string(),
  status: z.enum(SCHEDULE_STATUSES),
  latestVersion: z.number().int(),
  publishedVersion: z.number().int().nullable(),
  /** Newest version (a draft while it has no publishedAt). */
  latest: scheduleVersionDtoSchema,
  /** The version devices run, or null. */
  published: scheduleVersionDtoSchema.nullable(),
  createdAt: iso,
  updatedAt: iso,
});
export type ScheduleDto = z.infer<typeof scheduleDtoSchema>;

export const deviceConfigDtoSchema = z.object({
  deviceId: z.string(),
  configVersion: z.number().int(),
  status: z.enum(DEVICE_CONFIG_STATUSES),
  publishedAt: iso,
  appliedAt: iso.nullable(),
  reason: z.string().nullable(),
  sourceVersions: z.array(z.object({ scheduleId: z.string(), version: z.number().int() })),
});
export type DeviceConfigDto = z.infer<typeof deviceConfigDtoSchema>;

/** Per device of a schedule: the room relays it carries and the latest config sent to it. */
export const scheduleDeviceStatusDtoSchema = z.object({
  deviceId: z.string(),
  relays: z.array(z.number().int()),
  config: deviceConfigDtoSchema.nullable(),
});
export type ScheduleDeviceStatusDto = z.infer<typeof scheduleDeviceStatusDtoSchema>;

export const schedulePublishResultDtoSchema = z.object({
  schedule: scheduleDtoSchema,
  configs: z.array(deviceConfigDtoSchema),
});
export type SchedulePublishResultDto = z.infer<typeof schedulePublishResultDtoSchema>;

/** `schedule:updated` socket payload (one per affected device room). */
export interface ScheduleUpdatedData {
  scheduleId: string | null;
  roomId: string | null;
  status: ScheduleStatus | null;
  configs: DeviceConfigDto[];
}
