import type { SubmitCommandBody } from "@cimcms/contracts";
import CommandService, { type ListCommandsQuery } from "@services/command.service";
import { AppError } from "@utils/errors/custom.errors";
import { handleDataRetrieval, handleSuccess } from "@utils/responsehandler/index.utils";
import type { Request, Response } from "express";

class CommandController {
  /** POST /devices/:id/commands -> 202 with the new command, or 200 for a repeated Idempotency-Key. */
  static async submit(req: Request, res: Response): Promise<void> {
    const subject = req.subject;
    if (!subject) throw new AppError("Authentication required", 401, "UNAUTHENTICATED");
    const { command, created } = await CommandService.submit(
      subject,
      req.params.id as string,
      req.body as SubmitCommandBody,
      req.header("Idempotency-Key") ?? undefined,
      { requestId: req.requestId ?? null, ip: req.ip ?? null },
    );
    handleSuccess(
      res,
      command,
      created ? "Command accepted" : "Command already submitted",
      created ? 202 : 200,
    );
  }

  /** GET /devices/:id/commands */
  static async list(req: Request, res: Response): Promise<void> {
    const result = await CommandService.list(req.params.id as string, req.query as unknown as ListCommandsQuery);
    handleDataRetrieval(res, result, "Commands fetched successfully");
  }

  /** GET /commands/:commandId */
  static async getOne(req: Request, res: Response): Promise<void> {
    const result = await CommandService.get(req.params.commandId as string);
    handleDataRetrieval(res, result, "Command fetched successfully");
  }
}

export default CommandController;
