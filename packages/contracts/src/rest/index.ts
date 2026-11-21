import { z } from 'zod';
import { mode, onOff, relayNo } from '../mqtt/primitives.js';

export const submitCommandBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('SET_RELAY'), relay: relayNo, state: onOff }),
  z.object({ action: z.literal('SET_ALL_RELAYS'), state: onOff }),
  z.object({ action: z.literal('REQUEST_STATUS') }),
  z.object({ action: z.literal('SET_MODE'), mode }),
]); // T5.5 adds RTC_SYNC_NOW
export type SubmitCommandBody = z.infer<typeof submitCommandBodySchema>;

export const idempotencyKeySchema = z.string().uuid(); // header Idempotency-Key, optional
export const timeRangeQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const objectIdParamSchema = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) });
