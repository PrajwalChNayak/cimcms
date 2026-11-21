import { NextFunction, Request, Response, Router } from "express";

import setUpAuthRoutes from "@routes/modules/auth.routes";
import setUpCommandRoutes from "@routes/modules/command.routes";
import setUpDeviceRoutes from "@routes/modules/device.routes";
import setUpDeviceReadRoutes from "@routes/modules/deviceread.routes";
import setUpExperimentRoutes from "@routes/modules/experiment.routes";
import setUpFarmRoutes from "@routes/modules/farm.routes";
import setUpMasterRouters from "@routes/modules/master.routers";
import setUpReportRoutes from "@routes/modules/report.routes";
import setUpRoomRoutes from "@routes/modules/room.routes";
import setUpScheduleRoutes from "@routes/modules/schedule.routes";
import setUpSystemRoutes from "@routes/modules/system.routes";
import setUpUserRoutes from "@routes/modules/user.routes";

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void> | void;

const apiRoutes = Router();

// Wrap async route handlers so errors are forwarded to Express error handler
const use =
  (fn: AsyncHandler): AsyncHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// Register all sub-routes

setUpUserRoutes(apiRoutes);
setUpAuthRoutes(apiRoutes);
setUpFarmRoutes(apiRoutes);
setUpDeviceRoutes(apiRoutes);
setUpCommandRoutes(apiRoutes);
setUpDeviceReadRoutes(apiRoutes);
setUpMasterRouters(apiRoutes);
setUpRoomRoutes(apiRoutes);
setUpScheduleRoutes(apiRoutes);
setUpExperimentRoutes(apiRoutes);
setUpSystemRoutes(apiRoutes);
setUpReportRoutes(apiRoutes);
// Apply async error-catching wrapper to every registered route handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(apiRoutes.stack as any[]).forEach((apiLayer: any) => {
  if (!apiLayer.route) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiLayer.route.stack.forEach((routeLayer: any) => {
    routeLayer.handle = use(routeLayer.handle as AsyncHandler);
  });
});

export default apiRoutes;
