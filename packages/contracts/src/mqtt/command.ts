import { z } from 'zod';
import { COMMAND_SOURCES } from '../constants.js';
import { deviceIdSchema, isoUtc, mode, onOff, relayNo } from './primitives.js';

const commandBase = {
  schema_version: z.literal(1),
  command_id: z.string().uuid(),
  device_id: deviceIdSchema,
  issued_at_utc: isoUtc,
  expires_at_utc: isoUtc,
  source: z.enum(COMMAND_SOURCES),
};
export const commandWireSchema = z.discriminatedUnion('action', [
  z.object({ ...commandBase, action: z.literal('SET_RELAY'), relay: relayNo, state: onOff }),
  z.object({ ...commandBase, action: z.literal('SET_ALL_RELAYS'), state: onOff }),
  z.object({ ...commandBase, action: z.literal('REQUEST_STATUS') }),
  z.object({ ...commandBase, action: z.literal('SET_MODE'), mode }),
  z.object({ ...commandBase, action: z.literal('RTC_SYNC_NOW') }),
]);
export type CommandWire = z.infer<typeof commandWireSchema>;
