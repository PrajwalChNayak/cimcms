import { z } from 'zod';
import { DEVICE_TYPES, type DeviceType } from '../deviceTypes.js';
import { deviceIdSchema } from '../mqtt/primitives.js';

/** Device types that can be registered now (implemented or monitor-only; planned types cannot). */
export const REGISTRABLE_DEVICE_TYPES = (Object.keys(DEVICE_TYPES) as DeviceType[]).filter(
  (t) => DEVICE_TYPES[t].status !== 'PLANNED',
) as [DeviceType, ...DeviceType[]];

const name = z.string().trim().min(1).max(120);
const location = z.string().trim().max(200);

/** POST /devices/register (DEVICE_MANAGE). `deviceId` is the physical id and the broker username. */
export const registerDeviceBodySchema = z.object({
  deviceId: deviceIdSchema,
  deviceType: z.enum(REGISTRABLE_DEVICE_TYPES),
  name: name.optional(),
  location: location.optional(),
});
export type RegisterDeviceBody = z.infer<typeof registerDeviceBodySchema>;

/** PUT /devices/:id (DEVICE_MANAGE). Only descriptive fields; deviceId and type cannot change. */
export const updateDeviceBodySchema = z
  .object({
    name: name.optional(),
    location: location.optional(),
  })
  .strict();
export type UpdateDeviceBody = z.infer<typeof updateDeviceBodySchema>;
