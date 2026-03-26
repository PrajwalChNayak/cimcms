import { Constants } from "@utils/constant.utils";
import logger from "@utils/logger.utils";
import {
  handleError,
  handleUnauthorized,
} from "@utils/responsehandler/index.utils";
import dotenv from "dotenv";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
dotenv.config();

const { verify } = jwt;

const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.header("Authorization");

  if (!authHeader) {
    handleUnauthorized(res);
    return;
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  verify(token, process.env.JWT_SECRET_KEY as string, (err, user) => {
    if (err) {
      logger.error(String(err));
      handleError(res, err, Constants.HTTPFORBIDDEN);
      return;
    }

    req.subject = user as Request["subject"];
    next();
  });
};

export default authenticateToken;
