import ReportController from "@controllers/report.controller";
import authenticateToken from "@middleware/auth.middleware";
import { requirePermission } from "@middleware/permission.middleware";
import { validate } from "@middleware/validate.middleware";
import { MAX_RANGE_MS } from "@services/report.service";
import { Router } from "express";
import { z } from "zod";

/** `from` inclusive, `to` exclusive, both ISO UTC instants; at most 31 days apart. */
export const reportQuery = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    deviceId: z.string().min(1).max(64).optional(),
  })
  .superRefine((q, ctx) => {
    const span = Date.parse(q.to) - Date.parse(q.from);
    if (span <= 0) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "to must be after from" });
    } else if (span > MAX_RANGE_MS) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "Range must not exceed 31 days" });
    }
  });

export default (router: Router): void => {
  const guard = [
    authenticateToken,
    requirePermission("REPORT_EXPORT"),
    validate({ query: reportQuery }),
  ] as const;
  router.get("/reports/relay-on-time.csv", ...guard, ReportController.relayOnTime);
  router.get("/reports/commands.csv", ...guard, ReportController.commands);
  router.get("/reports/availability.csv", ...guard, ReportController.availability);
};
