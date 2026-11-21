import { z } from 'zod';
import { DEVICE_EVENT_TYPES, RELAY_CHANGE_SOURCES } from '../constants.js';
import { deviceIdSchema, isoUtc, onOff, relayNo } from './primitives.js';

export const eventWireSchema = z.object({
  schema_version: z.literal(1),
  device_id: deviceIdSchema,
  timestamp_utc: isoUtc,
  boot_id: z.string().max(40).optional(),
  seq: z.number().int().nonnegative().optional(),
  type: z.enum(DEVICE_EVENT_TYPES),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type EventWire = z.infer<typeof eventWireSchema>;

export const relayChangedDataSchema = z.object({
  relay: relayNo,
  state: onOff,
  source: z.enum(RELAY_CHANGE_SOURCES),
  command_id: z.string().uuid().nullable().optional(),
});
export type RelayChangedData = z.infer<typeof relayChangedDataSchema>;

/** `data` of a CONFIG_APPLIED event (plan T5.3). */
export const configAppliedDataSchema = z.object({
  config_version: z.number().int().nonnegative(),
  result: z.enum(['APPLIED', 'REJECTED']),
  reason: z.string().max(64).optional(),
});
export type ConfigAppliedData = z.infer<typeof configAppliedDataSchema>;
