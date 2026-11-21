import { z } from 'zod';
import { ACK_RESULTS, COMMAND_ACTIONS } from '../constants.js';
import { deviceIdSchema, isoUtc, onOff, relayNo } from './primitives.js';

export const ackWireSchema = z.object({
  schema_version: z.literal(1),
  command_id: z.string().uuid(),
  device_id: deviceIdSchema,
  action: z.enum(COMMAND_ACTIONS).optional(),
  result: z.enum(ACK_RESULTS),
  reason: z.string().max(64).optional(), // e.g. INVALID_PAYLOAD, WRONG_DEVICE, MODE_POLICY, RTC_INVALID
  relay: relayNo.optional(),
  requested_state: onOff.optional(),
  reported_state: onOff.optional(),
  timestamp_utc: isoUtc,
  simulation_mode: z.boolean(),
  clock_unverified: z.boolean().optional(), // proposal: true when RTC invalid (O-5)
});
export type AckWire = z.infer<typeof ackWireSchema>;
