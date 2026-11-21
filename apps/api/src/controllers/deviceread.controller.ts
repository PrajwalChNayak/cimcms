import DeviceReadService from "@services/deviceread.service";
import { handleDataRetrieval } from "@utils/responsehandler/index.utils";
import type { Request, Response } from "express";

// req.query was already parsed (and defaulted) by the route's Zod schema.
const query = <T>(req: Request): T => req.query as unknown as T;
const id = (req: Request): string => req.params.id as string;

class DeviceReadController {
  static async list(req: Request, res: Response): Promise<void> {
    const result = await DeviceReadService.listDevices(query(req));
    handleDataRetrieval(res, result, "Devices fetched successfully");
  }

  static async state(req: Request, res: Response): Promise<void> {
    handleDataRetrieval(res, await DeviceReadService.state(id(req)), "Device state fetched successfully");
  }

  static async readiness(req: Request, res: Response): Promise<void> {
    handleDataRetrieval(res, await DeviceReadService.readiness(id(req)), "Device readiness fetched successfully");
  }

  static async telemetry(req: Request, res: Response): Promise<void> {
    const result = await DeviceReadService.telemetry(id(req), query(req));
    handleDataRetrieval(res, result, "Telemetry fetched successfully");
  }

  static async events(req: Request, res: Response): Promise<void> {
    const result = await DeviceReadService.events(id(req), query(req));
    handleDataRetrieval(res, result, "Events fetched successfully");
  }

  static async relayChanges(req: Request, res: Response): Promise<void> {
    const result = await DeviceReadService.relayChanges(id(req), query(req));
    handleDataRetrieval(res, result, "Relay changes fetched successfully");
  }

  static async audit(req: Request, res: Response): Promise<void> {
    handleDataRetrieval(res, await DeviceReadService.audit(query(req)), "Audit log fetched successfully");
  }
}

export default DeviceReadController;
