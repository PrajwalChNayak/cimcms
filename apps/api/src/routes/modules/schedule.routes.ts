import {
  createScheduleBodySchema,
  objectIdParamSchema,
  scheduleListQuerySchema,
  updateScheduleBodySchema,
} from "@cimcms/contracts";
import ScheduleController from "@controllers/schedule.controller";
import authenticateToken from "@middleware/auth.middleware";
import { requirePermission } from "@middleware/permission.middleware";
import { validate } from "@middleware/validate.middleware";
import { Router } from "express";

export default (router: Router): void => {
  const read = [authenticateToken, requirePermission("SCHEDULE_READ")] as const;
  const write = [authenticateToken, requirePermission("SCHEDULE_WRITE")] as const;
  const publish = [authenticateToken, requirePermission("SCHEDULE_PUBLISH")] as const;
  const params = validate({ params: objectIdParamSchema });

  router.get("/schedules", ...read, validate({ query: scheduleListQuerySchema }), ScheduleController.list);
  router.post("/schedules", ...write, validate({ body: createScheduleBodySchema }), ScheduleController.create);
  router.get("/schedules/:id", ...read, params, ScheduleController.get);
  router.put(
    "/schedules/:id",
    ...write,
    validate({ params: objectIdParamSchema, body: updateScheduleBodySchema }),
    ScheduleController.update,
  );
  router.get("/schedules/:id/versions", ...read, params, ScheduleController.versions);
  router.get("/schedules/:id/devices", ...read, params, ScheduleController.devices);
  router.post("/schedules/:id/publish", ...publish, params, ScheduleController.publish);
  router.post("/schedules/:id/archive", ...write, params, ScheduleController.archive);
};
