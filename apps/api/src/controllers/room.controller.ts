import type {
  CreateRoomBody,
  ReplaceChannelsBody,
  RoomListQuery,
  UpdateRoomBody,
} from "@cimcms/contracts";
import RoomService from "@services/room.service";
import { auditMeta, requireSubject } from "@utils/request.utils";
import { handleDataCreation, handleDataRetrieval, handleSuccess } from "@utils/responsehandler/index.utils";
import type { Request, Response } from "express";

const id = (req: Request): string => req.params.id as string;

class RoomController {
  static async list(req: Request, res: Response): Promise<void> {
    handleDataRetrieval(res, await RoomService.list(req.query as unknown as RoomListQuery), "Rooms fetched successfully");
  }

  static async get(req: Request, res: Response): Promise<void> {
    handleDataRetrieval(res, await RoomService.get(id(req)), "Room fetched successfully");
  }

  static async create(req: Request, res: Response): Promise<void> {
    const room = await RoomService.create(requireSubject(req), req.body as CreateRoomBody, auditMeta(req));
    handleDataCreation(res, room, "Room created");
  }

  static async update(req: Request, res: Response): Promise<void> {
    const room = await RoomService.update(requireSubject(req), id(req), req.body as UpdateRoomBody, auditMeta(req));
    handleSuccess(res, room, "Room updated");
  }

  static async getChannels(req: Request, res: Response): Promise<void> {
    handleDataRetrieval(res, await RoomService.getChannels(id(req)), "Room channels fetched successfully");
  }

  static async replaceChannels(req: Request, res: Response): Promise<void> {
    const { channels } = await RoomService.replaceChannels(
      requireSubject(req),
      id(req),
      req.body as ReplaceChannelsBody,
      auditMeta(req),
    );
    handleSuccess(res, channels, "Room channels updated");
  }

  static async channelView(req: Request, res: Response): Promise<void> {
    const { deviceId } = req.query as { deviceId?: string };
    handleDataRetrieval(res, await RoomService.channelView(deviceId), "Room channels fetched successfully");
  }
}

export default RoomController;
