import {
  BACKEND_EVENT_TYPES,
  DEVICE_EVENT_TYPES,
  DEVICE_TYPES,
  idParamSchema,
  idSchema,
  pageQuerySchema,
  timeRangeQuerySchema,
  type DeviceType,
} from "@cimcms/contracts";
import DeviceReadController from "@controllers/deviceread.controller";
import authenticateToken from "@middleware/auth.middleware";
import { requirePermission } from "@middleware/permission.middleware";
import { validate } from "@middleware/validate.middleware";
import { Router } from "express";
import { z } from "zod";

const iso = z.string().datetime();
const deviceTypes = Object.keys(DEVICE_TYPES) as [DeviceType, ...DeviceType[]];

const listQuery = pageQuerySchema.extend({ type: z.enum(deviceTypes).optional() });
const eventsQuery = pageQuerySchema.extend({
  type: z.enum([...DEVICE_EVENT_TYPES, ...BACKEND_EVENT_TYPES]).optional(),
  from: iso.optional(),
  to: iso.optional(),
});
const relayQuery = pageQuerySchema.extend({
  relay: z.coerce.number().int().min(1).max(16).optional(),
  from: iso.optional(),
  to: iso.optional(),
});
const auditQuery = pageQuerySchema.extend({
  actorId: idSchema.optional(),
  action: z.string().min(1).max(100).optional(),
  entity: z.string().min(1).max(100).optional(),
  from: iso.optional(),
  to: iso.optional(),
});

/** Three-segment device paths never collide with the legacy `/devices/consumer` or `/devices/:id`. */
export default (router: Router): void => {
  const read = [authenticateToken, requirePermission("DEVICE_READ")] as const;

  router.get("/devices", ...read, validate({ query: listQuery }), DeviceReadController.list);
  router.get(
    "/devices/:id/state",
    ...read,
    validate({ params: idParamSchema }),
    DeviceReadController.state,
  );
  router.get(
    "/devices/:id/readiness",
    ...read,
    validate({ params: idParamSchema }),
    DeviceReadController.readiness,
  );
  router.get(
    "/devices/:id/telemetry",
    ...read,
    validate({ params: idParamSchema, query: timeRangeQuerySchema }),
    DeviceReadController.telemetry,
  );
  router.get(
    "/devices/:id/events",
    ...read,
    validate({ params: idParamSchema, query: eventsQuery }),
    DeviceReadController.events,
  );
  router.get(
    "/devices/:id/relay-changes",
    ...read,
    validate({ params: idParamSchema, query: relayQuery }),
    DeviceReadController.relayChanges,
  );
  router.get(
    "/audit",
    authenticateToken,
    requirePermission("AUDIT_READ"),
    validate({ query: auditQuery }),
    DeviceReadController.audit,
  );
};
