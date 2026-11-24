import {
  createExperimentBodySchema,
  experimentListQuerySchema,
  idParamSchema,
  updateExperimentBodySchema,
} from "@cimcms/contracts";
import ExperimentController from "@controllers/experiment.controller";
import authenticateToken from "@middleware/auth.middleware";
import { requirePermission } from "@middleware/permission.middleware";
import { validate } from "@middleware/validate.middleware";
import { Router } from "express";

export default (router: Router): void => {
  const read = [authenticateToken, requirePermission("EXPERIMENT_READ")] as const;
  const write = [authenticateToken, requirePermission("EXPERIMENT_WRITE")] as const;
  const run = [authenticateToken, requirePermission("EXPERIMENT_RUN")] as const;
  const params = validate({ params: idParamSchema });

  router.get("/experiments", ...read, validate({ query: experimentListQuerySchema }), ExperimentController.list);
  router.post("/experiments", ...write, validate({ body: createExperimentBodySchema }), ExperimentController.create);
  router.get("/experiments/:id", ...read, params, ExperimentController.get);
  router.put(
    "/experiments/:id",
    ...write,
    validate({ params: idParamSchema, body: updateExperimentBodySchema }),
    ExperimentController.update,
  );
  router.get("/experiments/:id/devices", ...read, params, ExperimentController.devices);
  router.get("/experiments/:id/events", ...read, params, ExperimentController.log);

  // Preparing the config is a write; running the lifecycle needs EXPERIMENT_RUN.
  router.post("/experiments/:id/ready", ...write, params, ExperimentController.ready);
  router.post("/experiments/:id/revert", ...write, params, ExperimentController.revert);
  router.post("/experiments/:id/resend", ...write, params, ExperimentController.resend);
  router.post("/experiments/:id/start", ...run, params, ExperimentController.start);
  router.post("/experiments/:id/pause", ...run, params, ExperimentController.pause);
  router.post("/experiments/:id/resume", ...run, params, ExperimentController.resume);
  router.post("/experiments/:id/stop", ...run, params, ExperimentController.stop);
};
