import { z } from 'zod';
import { LED_CHANNEL_COUNT } from '../constants.js';
import { deviceIdSchema, isoUtc, relayNo } from './primitives.js';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const scheduleWindow = z.object({
  days: z.array(z.number().int().min(1).max(7)).min(1), // ISO: 1=Mon .. 7=Sun
  on: hhmm,
  off: hhmm, // off < on means it crosses midnight; on == off invalid
});
const channelProgram = z.object({ relay: relayNo, windows: z.array(scheduleWindow).max(8) });
export const configWireSchema = z.object({
  schema_version: z.literal(1),
  device_id: deviceIdSchema,
  config_version: z.number().int().positive(),
  issued_at_utc: isoUtc,
  timezone: z.literal('Asia/Kolkata'),
  tz_offset_minutes: z.literal(330),
  auto: z
    .object({
      effective_from: dateOnly,
      effective_to: dateOnly.nullable(),
      channels: z.array(channelProgram).max(LED_CHANNEL_COUNT),
    })
    .nullable(),
  experiment: z
    .object({
      experiment_id: z.string().max(40),
      starts_at_utc: isoUtc,
      ends_at_utc: isoUtc,
      channels: z.array(channelProgram).max(LED_CHANNEL_COUNT),
    })
    .nullable(),
});
export type ConfigWire = z.infer<typeof configWireSchema>;
