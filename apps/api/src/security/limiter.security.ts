import { AppError } from "@utils/errors/custom.errors";
import type { NextFunction, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";

const RATE_LIMITED_MESSAGE = "Too many requests. Please try again later.";

// Responses go through the shared error handler so they carry errorCode RATE_LIMITED.
const rateLimitedHandler = (
  _req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  next(new AppError(RATE_LIMITED_MESSAGE, 429, "RATE_LIMITED"));
};

const baseOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitedHandler,
} as const;

/** 1000 requests / 10 minutes per IP, applied to the whole API. */
export const generalLimiter = rateLimit({
  ...baseOptions,
  windowMs: 10 * 60 * 1000,
  limit: 1000,
});

/**
 * 50 attempts / 15 minutes per IP, across all emails. Stops one IP from guessing
 * passwords for many accounts (loginLimiter alone keys on IP + email).
 */
export const loginIpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 50,
});

/** 10 attempts / 15 minutes per IP + lower-cased email, for login endpoints. */
export const loginLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req: Request): string => {
    const body = req.body as { email?: unknown } | undefined;
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    return `${req.ip ?? "unknown"}|${email}`;
  },
});

/**
 * 60 commands / 1 minute per authenticated user.
 * Use after authenticateToken (needs req.subject.userId).
 */
export const commandLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: (req: Request): string =>
    req.subject?.userId ?? `ip:${req.ip ?? "unknown"}`,
});
