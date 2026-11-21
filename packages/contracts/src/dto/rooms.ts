import { z } from 'zod';
import { relayNo } from '../mqtt/primitives.js';

const iso = z.string().datetime();

export const ROOM_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const roomDtoSchema = z.object({
  id: z.string(),
  farmId: z.string().nullable(),
  code: z.string(),
  name: z.string(),
  status: z.enum(ROOM_STATUSES),
  notes: z.string().nullable(),
  channelCount: z.number().int(),
  createdAt: iso,
  updatedAt: iso,
});
export type RoomDto = z.infer<typeof roomDtoSchema>;

/** One relay of one device assigned to a room. */
export const roomChannelDtoSchema = z.object({
  deviceId: z.string(),
  relay: relayNo,
  label: z.string().nullable(),
});
export type RoomChannelDto = z.infer<typeof roomChannelDtoSchema>;

/** Assignment together with its room (channel picker, relay labels). */
export const roomChannelViewDtoSchema = roomChannelDtoSchema.extend({
  roomId: z.string(),
  roomCode: z.string(),
  roomName: z.string(),
});
export type RoomChannelViewDto = z.infer<typeof roomChannelViewDtoSchema>;
