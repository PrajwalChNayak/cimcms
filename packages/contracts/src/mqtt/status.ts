import { z } from 'zod';
import type { Mode } from '../constants.js';
import { deviceIdSchema, isoUtc, mode } from './primitives.js';

export const statusWireSchema = z.object({
  schema_version: z.literal(1),
  device_id: deviceIdSchema,
  state: z.enum(['online', 'offline']),
  firmware_version: z.string().max(32).optional(),
  mode: mode.optional(),
  boot_id: z.string().max(40).optional(), // proposal
  timestamp_utc: isoUtc.optional(),
});
export type StatusWire = z.infer<typeof statusWireSchema>;

export interface ParsedStatus {
  state: 'online' | 'offline';
  firmwareVersion?: string;
  mode?: Mode;
  bootId?: string;
}

/** Accepts JSON status or legacy plain text "online"/"offline". Returns null if neither. */
export function parseStatusPayload(raw: string, topicDeviceId: string): ParsedStatus | null {
  const text = raw.trim();
  if (text === 'online' || text === 'offline') return { state: text };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const res = statusWireSchema.safeParse(json);
  if (!res.success) return null;
  const d = res.data;
  if (d.device_id !== topicDeviceId) return null;
  const out: ParsedStatus = { state: d.state };
  if (d.firmware_version !== undefined) out.firmwareVersion = d.firmware_version;
  if (d.mode !== undefined) out.mode = d.mode;
  if (d.boot_id !== undefined) out.bootId = d.boot_id;
  return out;
}
