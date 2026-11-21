import {
  COMMAND_STATUSES,
  idempotencyKeySchema,
  objectIdParamSchema,
  pageQuerySchema,
  submitCommandBodySchema,
} from "@cimcms/contracts";
import CommandController from "@controllers/command.controller";
import authenticateToken from "@middleware/auth.middleware";
import { requirePermission } from "@middleware/permission.middleware";
import { validate } from "@middleware/validate.middleware";
import { commandLimiter } from "@security/limiter.security";
import { Router } from "express";
import { z } from "zod";

const listQuerySchema = pageQuerySchema.extend({ status: z.enum(COMMAND_STATUSES).optional() });
const submitHeadersSchema = z.looseObject({ "idempotency-key": idempotencyKeySchema.optional() });
const commandIdParamSchema = z.object({ commandId: z.string().uuid() });

/**
 * Registered as `/devices/:id/commands` (three segments) and `/commands/:commandId`,
 * so nothing collides with `/devices/consumer` or `/devices/:id`.
 */
export default (router: Router): void => {
  router.post(
    "/devices/:id/commands",
    authenticateToken,
    requirePermission("DEVICE_COMMAND"), // SET_ALL_RELAYS also needs DEVICE_COMMAND_BULK (checked in the service)
    commandLimiter,
    validate({
      params: objectIdParamSchema,
      headers: submitHeadersSchema,
      body: submitCommandBodySchema,
    }),
    CommandController.submit,
  );

  router.post(
    "/devices/:id/rtc-sync",
    authenticateToken,
    requirePermission("DEVICE_DIAGNOSTICS"),
    commandLimiter,
    validate({ params: objectIdParamSchema, headers: submitHeadersSchema }),
    CommandController.rtcSync,
  );

  router.get(
    "/devices/:id/commands",
    authenticateToken,
    requirePermission("DEVICE_READ"),
    validate({ params: objectIdParamSchema, query: listQuerySchema }),
    CommandController.list,
  );

  router.get(
    "/commands/:commandId",
    authenticateToken,
    requirePermission("DEVICE_READ"),
    validate({ params: commandIdParamSchema }),
    CommandController.getOne,
  );
};
