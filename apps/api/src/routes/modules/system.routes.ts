import SystemController from "@controllers/system.controller";
import authenticateToken from "@middleware/auth.middleware";
import { requirePermission } from "@middleware/permission.middleware";
import { Router } from "express";

/** `/health/*` is not reachable through the same-origin proxy, so the system page reads this instead. */
export default (router: Router): void => {
  router.get(
    "/system/status",
    authenticateToken,
    requirePermission("DEVICE_MANAGE"), // admin only
    SystemController.status,
  );
};
