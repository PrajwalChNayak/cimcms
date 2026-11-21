import { AppError } from "@utils/errors/custom.errors";
import type { NextFunction, Request, Response } from "express";

/**
 * CSRF defence in depth for cookie-authenticated endpoints (refresh, logout).
 * In production the Origin header must equal APP_BASE_URL, otherwise 403.
 * Outside production the check is skipped (dev proxy, tests, curl).
 */
const requireAppOrigin = (req: Request, _res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }
  const expected = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
  const origin = req.header("Origin");
  if (!expected || origin !== expected) {
    next(new AppError("Origin not allowed", 403, "FORBIDDEN"));
    return;
  }
  next();
};

export default requireAppOrigin;
