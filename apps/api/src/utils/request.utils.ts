import type { CommandSubject } from "@services/command.service";
import { AppError } from "@utils/errors/custom.errors";
import type { Request } from "express";

/** The authenticated caller; throws 401 when the auth middleware did not run. */
export function requireSubject(req: Request): CommandSubject {
  const subject = req.subject;
  if (!subject) throw new AppError("Authentication required", 401, "UNAUTHENTICATED");
  return subject;
}

/** Request id and client IP for audit records. */
export function auditMeta(req: Request): { requestId: string | null; ip: string | null } {
  return { requestId: req.requestId ?? null, ip: req.ip ?? null };
}
