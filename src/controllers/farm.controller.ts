import FarmService from "@services/farm.service";
import {
  handleDataCreation,
  handleDataRetrieval,
  handleSuccess,
} from "@utils/responsehandler/index.utils";
import { Request, Response } from "express";

class FarmController {
  static async createFarm(req: Request, res: Response): Promise<void> {
    const result = await FarmService.createFarm(req.body);
    handleDataCreation(res, result, "Farm created successfully");
  }

  static async getFarmsByConsumerId(
    req: Request,
    res: Response,
  ): Promise<void> {
    const { page = "1", limit = "10", name, address, consumerId } = req.query;

    const result = await FarmService.getFarmsByConsumerId(
      +page,
      +limit,
      consumerId as string,
      name as string | undefined,
      address as string | undefined,
    );

    handleDataRetrieval(res, result, "Farms fetched successfully");
  }

  static async getFarmById(req: Request, res: Response): Promise<void> {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const result = await FarmService.getFarmById(id);
    handleSuccess(res, result, "Farm fetched successfully");
  }

  static async updateFarm(req: Request, res: Response): Promise<void> {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const result = await FarmService.updateFarm(id, req.body);
    handleSuccess(res, result, "Farm updated successfully");
  }

  static async deleteFarm(req: Request, res: Response): Promise<void> {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const result = await FarmService.deleteFarm(id);
    handleSuccess(res, result, "Farm deleted successfully");
  }
}

export default FarmController;
