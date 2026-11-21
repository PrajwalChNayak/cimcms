import type {
  CreateExperimentBody,
  ExperimentListQuery,
  UpdateExperimentBody,
} from "@cimcms/contracts";
import ExperimentService from "@services/experiment.service";
import { auditMeta, requireSubject } from "@utils/request.utils";
import { handleDataCreation, handleDataRetrieval, handleSuccess } from "@utils/responsehandler/index.utils";
import type { Request, Response } from "express";

const id = (req: Request): string => req.params.id as string;

class ExperimentController {
  static async list(req: Request, res: Response): Promise<void> {
    handleDataRetrieval(res, await ExperimentService.list(req.query as unknown as ExperimentListQuery), "Experiments fetched successfully");
  }

  static async get(req: Request, res: Response): Promise<void> {
    handleDataRetrieval(res, await ExperimentService.get(id(req)), "Experiment fetched successfully");
  }

  static async devices(req: Request, res: Response): Promise<void> {
    handleDataRetrieval(res, await ExperimentService.deviceStatus(id(req)), "Experiment devices fetched successfully");
  }

  static async log(req: Request, res: Response): Promise<void> {
    handleDataRetrieval(res, await ExperimentService.log(id(req)), "Experiment log fetched successfully");
  }

  static async create(req: Request, res: Response): Promise<void> {
    const dto = await ExperimentService.create(requireSubject(req), req.body as CreateExperimentBody, auditMeta(req));
    handleDataCreation(res, dto, "Experiment created");
  }

  static async update(req: Request, res: Response): Promise<void> {
    const dto = await ExperimentService.update(requireSubject(req), id(req), req.body as UpdateExperimentBody, auditMeta(req));
    handleSuccess(res, dto, "Experiment updated");
  }

  static async ready(req: Request, res: Response): Promise<void> {
    handleSuccess(res, await ExperimentService.markReady(requireSubject(req), id(req), auditMeta(req)), "Experiment is ready");
  }

  static async revert(req: Request, res: Response): Promise<void> {
    handleSuccess(res, await ExperimentService.revertToDraft(requireSubject(req), id(req), auditMeta(req)), "Experiment is a draft again");
  }

  static async resend(req: Request, res: Response): Promise<void> {
    handleSuccess(res, await ExperimentService.resend(requireSubject(req), id(req), auditMeta(req)), "Experiment config sent again");
  }

  static async start(req: Request, res: Response): Promise<void> {
    handleSuccess(res, await ExperimentService.start(requireSubject(req), id(req), auditMeta(req)), "Experiment started");
  }

  static async pause(req: Request, res: Response): Promise<void> {
    handleSuccess(res, await ExperimentService.pause(requireSubject(req), id(req), auditMeta(req)), "Experiment paused");
  }

  static async resume(req: Request, res: Response): Promise<void> {
    handleSuccess(res, await ExperimentService.resume(requireSubject(req), id(req), auditMeta(req)), "Experiment resumed");
  }

  static async stop(req: Request, res: Response): Promise<void> {
    handleSuccess(res, await ExperimentService.stop(requireSubject(req), id(req), auditMeta(req)), "Experiment stopped");
  }
}

export default ExperimentController;
