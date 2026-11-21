import SystemService from "@services/system.service";
import { Router, type Request, type Response } from "express";

/**
 * Health probes for Docker / Nginx / uptime checks. Mounted at the app root
 * (outside MAIN_ROUTE), before the rate limiter, no authentication.
 * Output carries no secrets, versions or host names.
 */
const healthRouter = Router();

healthRouter.get("/live", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

healthRouter.get("/ready", async (_req: Request, res: Response) => {
  const body = await SystemService.status();
  res.status(body.status === "ok" ? 200 : 503).json(body);
});

export default healthRouter;
