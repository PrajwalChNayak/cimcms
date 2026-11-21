import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const REQUEST_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Uses the incoming X-Request-Id when it is well formed, otherwise generates a
 * UUID. Sets req.requestId and echoes it in the X-Request-Id response header.
 */
const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.header("x-request-id");
  const id = incoming && REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
};

export default requestId;
