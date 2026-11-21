import { AppError } from "@utils/errors/custom.errors";
import logger from "@utils/logger.utils";
import dotenv from "dotenv";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
dotenv.config();

const { verify } = jwt;

const unauthenticated = (message: string): AppError =>
  new AppError(message, 401, "UNAUTHENTICATED");

const authenticateToken = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.header("Authorization");

  if (!authHeader) {
    next(unauthenticated("Authentication required"));
    return;
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  verify(token, process.env.JWT_SECRET_KEY as string, (err, user) => {
    if (err) {
      logger.warn(`token rejected: ${err.name}`);
      next(unauthenticated("Invalid or expired token"));
      return;
    }

    // Tokens with a `typ` claim must be access tokens. Old consumer tokens
    // carry no `typ` and keep working.
    const typ = (user as { typ?: unknown } | undefined)?.typ;
    if (typ !== undefined && typ !== "access") {
      next(unauthenticated("Invalid token type"));
      return;
    }

    req.subject = user as Request["subject"];
    next();
  });
};

export default authenticateToken;
