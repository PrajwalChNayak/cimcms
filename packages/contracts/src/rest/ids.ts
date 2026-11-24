import { z } from 'zod';

/** Database record id (PostgreSQL UUID). REST path parameter `:id` and foreign-key fields. */
export const idSchema = z.uuid();
