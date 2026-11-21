import { handleBadRequest } from "@utils/responsehandler/index.utils";
import { Request, Response } from "express";
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  handler: (_req: Request, res: Response) => {
    return handleBadRequest(res);
  },
});

export default limiter;
