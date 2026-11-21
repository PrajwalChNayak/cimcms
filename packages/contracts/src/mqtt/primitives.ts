import { z } from 'zod';
import { DEVICE_MODES, LED_CHANNEL_COUNT, ON_OFF } from '../constants.js';

export const isoUtc = z.string().datetime(); // must end with Z
export const deviceIdSchema = z.string().regex(/^[A-Za-z0-9-]{3,40}$/);
export const relayNo = z.number().int().min(1).max(LED_CHANNEL_COUNT);
export const onOff = z.enum(ON_OFF);
export const mode = z.enum(DEVICE_MODES);
