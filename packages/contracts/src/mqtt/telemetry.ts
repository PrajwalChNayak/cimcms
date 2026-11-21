import { z } from 'zod';
import { LED_CHANNEL_COUNT } from '../constants.js';
import { deviceIdSchema, isoUtc, mode } from './primitives.js';

export const telemetryWireSchema = z.object({
  schema_version: z.literal(1),
  device_id: deviceIdSchema,
  firmware_version: z.string().max(32),
  timestamp_utc: isoUtc,
  boot_id: z.string().max(40).optional(), // proposal: random id per boot
  seq: z.number().int().nonnegative().optional(), // proposal: +1 per message, resets per boot
  mode,
  mode_status: z.enum(['ACTIVE', 'NOT_CONFIGURED']).optional(), // proposal
  simulation_mode: z.boolean(),
  connectivity: z.object({
    wifi_connected: z.boolean(),
    ssid: z.string().max(32).optional(),
    ip: z.string().max(45).optional(),
    rssi_dbm: z.number().int().min(-127).max(0).optional(),
    mqtt_connected: z.boolean(),
  }),
  relay_states: z.array(z.boolean()).length(LED_CHANNEL_COUNT),
  relay_on_count: z.number().int().min(0).max(LED_CHANNEL_COUNT),
  rtc: z
    .object({
      available: z.boolean().optional(),
      valid: z.boolean(),
      time_utc: isoUtc.optional(),
      sync_source: z.string().max(32).optional(),
      last_sync_utc: isoUtc.optional(),
      last_sync_result: z.string().max(32).optional(),
      drift_ms: z.number().int().optional(),
      lost_power: z.boolean().optional(),
    })
    .optional(),
  config_version: z.number().int().nonnegative().optional(), // Phase 5
  auto_ready: z.boolean().optional(), // Phase 5
});
// Do NOT add a refine for relay_on_count. Ingest recomputes it and logs a warning on mismatch.
export type TelemetryWire = z.infer<typeof telemetryWireSchema>;
