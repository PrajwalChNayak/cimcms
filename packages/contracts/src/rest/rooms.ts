import { z } from 'zod';
import { ROOM_STATUSES } from '../dto/rooms.js';
import { deviceIdSchema, relayNo } from '../mqtt/primitives.js';
import { pageQuerySchema } from './index.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);

export const roomCodeSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$/);

export const createRoomBodySchema = z.object({
  code: roomCodeSchema,
  name: z.string().trim().min(1).max(80),
  farmId: objectId.optional(),
  notes: z.string().max(500).optional(),
  status: z.enum(ROOM_STATUSES).optional(),
});
export type CreateRoomBody = z.infer<typeof createRoomBodySchema>;

/** The room code never changes after creation. */
export const updateRoomBodySchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    farmId: objectId.nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    status: z.enum(ROOM_STATUSES).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field is required' });
export type UpdateRoomBody = z.infer<typeof updateRoomBodySchema>;

export const replaceChannelsBodySchema = z.object({
  channels: z
    .array(
      z.object({
        deviceId: deviceIdSchema,
        relay: relayNo,
        label: z.string().trim().max(60).optional(),
      }),
    )
    .max(256),
});
export type ReplaceChannelsBody = z.infer<typeof replaceChannelsBodySchema>;

export const roomListQuerySchema = pageQuerySchema.extend({
  status: z.enum(ROOM_STATUSES).optional(),
  q: z.string().trim().max(80).optional(),
});
export type RoomListQuery = z.infer<typeof roomListQuerySchema>;

export const roomChannelsQuerySchema = z.object({ deviceId: deviceIdSchema.optional() });
