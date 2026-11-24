import {
  createRoomBodySchema,
  idParamSchema,
  replaceChannelsBodySchema,
  roomChannelsQuerySchema,
  roomListQuerySchema,
  updateRoomBodySchema,
} from "@cimcms/contracts";
import RoomController from "@controllers/room.controller";
import authenticateToken from "@middleware/auth.middleware";
import { requirePermission } from "@middleware/permission.middleware";
import { validate } from "@middleware/validate.middleware";
import { Router } from "express";

/** `/room-channels` is a separate path so it never collides with `/rooms/:id`. */
export default (router: Router): void => {
  const read = [authenticateToken, requirePermission("ROOM_READ")] as const;
  const write = [authenticateToken, requirePermission("ROOM_WRITE")] as const;

  router.get("/rooms", ...read, validate({ query: roomListQuerySchema }), RoomController.list);
  router.post("/rooms", ...write, validate({ body: createRoomBodySchema }), RoomController.create);
  router.get("/room-channels", ...read, validate({ query: roomChannelsQuerySchema }), RoomController.channelView);
  router.get("/rooms/:id", ...read, validate({ params: idParamSchema }), RoomController.get);
  router.put(
    "/rooms/:id",
    ...write,
    validate({ params: idParamSchema, body: updateRoomBodySchema }),
    RoomController.update,
  );
  router.get(
    "/rooms/:id/channels",
    ...read,
    validate({ params: idParamSchema }),
    RoomController.getChannels,
  );
  router.put(
    "/rooms/:id/channels",
    ...write,
    validate({ params: idParamSchema, body: replaceChannelsBodySchema }),
    RoomController.replaceChannels,
  );
};
