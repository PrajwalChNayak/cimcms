import { useListRoomChannelsQuery } from "@api/roomApi";
import { skipToken } from "@reduxjs/toolkit/query";
import { usePermission } from "@shared/hooks/usePermission";
import { useMemo } from "react";

export interface RelayRoom {
  roomId: string;
  roomCode: string;
  roomName: string;
  /** Optional channel label set when the relay was assigned. */
  label: string | null;
}

/** relay number -> room of one device. Empty without ROOM_READ (the UI only hides, the server enforces). */
export const useRelayRooms = (deviceId: string): Map<number, RelayRoom> => {
  const canRead = usePermission("ROOM_READ");
  const query = useListRoomChannelsQuery(canRead ? { deviceId } : skipToken);
  return useMemo(() => {
    const map = new Map<number, RelayRoom>();
    for (const c of query.data ?? []) {
      if (c.deviceId !== deviceId) continue;
      map.set(c.relay, {
        roomId: c.roomId,
        roomCode: c.roomCode,
        roomName: c.roomName,
        label: c.label,
      });
    }
    return map;
  }, [query.data, deviceId]);
};
