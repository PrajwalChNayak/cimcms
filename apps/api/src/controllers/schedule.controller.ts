import type {
  CreateScheduleBody,
  ScheduleListQuery,
  UpdateScheduleBody,
} from "@cimcms/contracts";
import ScheduleService from "@services/schedule.service";
import { auditMeta, requireSubject } from "@utils/request.utils";
import { handleDataCreation, handleDataRetrieval, handleSuccess } from "@utils/responsehandler/index.utils";
import type { Request, Response } from "express";

const id = (req: Request): string => req.params.id as string;

class ScheduleController {
  static async list(req: Request, res: Response): Promise<void> {
    handleDataRetrieval(res, await ScheduleService.list(req.query as unknown as ScheduleListQuery), "Schedules fetched successfully");
  }

  static async get(req: Request, res: Response): Promise<void> {
    handleDataRetrieval(res, await ScheduleService.get(id(req)), "Schedule fetched successfully");
  }

  static async versions(req: Request, res: Response): Promise<void> {
    handleDataRetrieval(res, await ScheduleService.versions(id(req)), "Schedule versions fetched successfully");
  }

  static async devices(req: Request, res: Response): Promise<void> {
    handleDataRetrieval(res, await ScheduleService.deviceStatus(id(req)), "Schedule devices fetched successfully");
  }

  static async create(req: Request, res: Response): Promise<void> {
    const dto = await ScheduleService.create(requireSubject(req), req.body as CreateScheduleBody, auditMeta(req));
    handleDataCreation(res, dto, "Schedule created");
  }

  static async update(req: Request, res: Response): Promise<void> {
    const dto = await ScheduleService.update(requireSubject(req), id(req), req.body as UpdateScheduleBody, auditMeta(req));
    handleSuccess(res, dto, "Schedule updated");
  }

  static async publish(req: Request, res: Response): Promise<void> {
    const result = await ScheduleService.publish(requireSubject(req), id(req), auditMeta(req));
    handleSuccess(res, result, "Schedule published");
  }

  static async archive(req: Request, res: Response): Promise<void> {
    const result = await ScheduleService.archive(requireSubject(req), id(req), auditMeta(req));
    handleSuccess(res, result, "Schedule archived");
  }
}

export default ScheduleController;
