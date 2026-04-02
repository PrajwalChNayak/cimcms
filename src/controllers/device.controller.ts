import DeviceService from "@services/device.service";
import {
  handleDataCreation,
  handleDataRetrieval,
  handleSuccess,
} from "@utils/responsehandler/index.utils";
import { Request, Response } from "express";

class DeviceController {
  static async createDeviceFarmer(req: Request, res: Response): Promise<void> {
    const result = await DeviceService.createDeviceFarmer(req.body);
    handleDataCreation(res, result, "Device created successfully");
  }

  static async getDevicesByConsumerId(
    req: Request,
    res: Response,
  ): Promise<void> {
    const {
      page = "1",
      limit = "10",
      name,
      type,
      location,
      deviceId,
      consumerId,
      farmId,
    } = req.query;

    const result = await DeviceService.getDevicesByConsumerId(
      +page,
      +limit,
      name as string | undefined,
      type as string | undefined,
      location as string | undefined,
      deviceId as string | undefined,
      consumerId as string,
      farmId as string | undefined,
    );
    handleDataRetrieval(res, result, "Devices fetched successfully");
  }

  static async getDeviceById(req: Request, res: Response): Promise<void> {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const result = await DeviceService.getDeviceById(id);
    handleSuccess(res, result, "Device fetched successfully");
  }

  static async updateDevice(req: Request, res: Response): Promise<void> {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const result = await DeviceService.updateDevice(id, req.body);
    handleSuccess(res, result, "Device updated successfully");
  }

  static async deleteDevice(req: Request, res: Response): Promise<void> {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const result = await DeviceService.deleteDevice(id);
    handleSuccess(res, result, "Device deleted successfully");
  }
}

export default DeviceController;
