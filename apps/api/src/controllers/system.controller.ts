import SystemService from "@services/system.service";
import { handleDataRetrieval } from "@utils/responsehandler/index.utils";
import type { Request, Response } from "express";

class SystemController {
  /** GET /system/status: same facts as /health/ready, for the admin system page. */
  static async status(_req: Request, res: Response): Promise<void> {
    handleDataRetrieval(res, await SystemService.status(), "System status fetched successfully");
  }
}

export default SystemController;
