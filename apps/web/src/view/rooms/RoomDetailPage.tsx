import {
  useGetRoomChannelsQuery,
  useGetRoomQuery,
  useListRoomChannelsQuery,
  useReplaceRoomChannelsMutation,
  useUpdateRoomMutation,
} from "@api/roomApi";
import { getDriverChannelCount } from "@cimcms/contracts";
import { useDevices } from "@features/devices/hooks/useDevices";
import { ChannelPicker, type PickedChannel } from "@features/rooms/components/ChannelPicker";
import { usePermission } from "@shared/hooks/usePermission";
import { extractErrorMessage } from "@shared/utils/errorUtils";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

const RoomDetail = ({ roomId }: { roomId: string }) => {
  const canWrite = usePermission("ROOM_WRITE");
  const room = useGetRoomQuery(roomId);
  const channels = useGetRoomChannelsQuery(roomId);
  const assignments = useListRoomChannelsQuery();
  const { devices } = useDevices();
  const [updateRoom, { isLoading: savingRoom }] = useUpdateRoomMutation();
  const [replace, { isLoading: savingChannels }] = useReplaceRoomChannelsMutation();

  const [name, setName] = useState<string | null>(null);
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedChannel[] | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  if (room.isLoading) return <p className="text-sm text-text-secondary" role="status">Loading room…</p>;
  if (room.isError || !room.data) return <p className="text-sm text-text-secondary">Room not found</p>;

  const r = room.data;
  const current: PickedChannel[] =
    picked ??
    (channels.data ?? []).map((c) => ({ deviceId: c.deviceId, relay: c.relay, label: c.label ?? "" }));
  const relayDevices = devices
    .filter((d) => getDriverChannelCount(d.type) !== null)
    .map((d) => d.deviceId);

  const saveDetails = () => {
    setMessage(null);
    updateRoom({
      id: roomId,
      body: {
        name: (name ?? r.name).trim(),
        status: status ?? r.status,
        notes: (notes ?? r.notes ?? "").trim() || null,
      },
    })
      .unwrap()
      .then(() => setMessage({ kind: "ok", text: "Room saved" }))
      .catch((e: unknown) =>
        setMessage({ kind: "error", text: extractErrorMessage(e, "Could not save the room") }),
      );
  };

  const saveChannels = () => {
    setMessage(null);
    replace({
      id: roomId,
      body: {
        channels: current.map((c) => ({
          deviceId: c.deviceId,
          relay: c.relay,
          ...(c.label.trim() && { label: c.label.trim() }),
        })),
      },
    })
      .unwrap()
      .then(() => {
        setPicked(null);
        setMessage({ kind: "ok", text: "Channels saved" });
      })
      .catch((e: unknown) =>
        setMessage({ kind: "error", text: extractErrorMessage(e, "Could not save the channels") }),
      );
  };

  return (
    <>
      <div className="rounded-card bg-surface border border-border p-4 space-y-3 text-sm">
        <h1 className="text-lg font-bold text-text-primary">
          {r.name} <span className="font-mono text-xs text-text-secondary">({r.code})</span>
        </h1>
        <label className="block">
          <span className="block font-medium mb-1">Room name</span>
          <input
            aria-label="Room name"
            value={name ?? r.name}
            disabled={!canWrite}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-btn border border-border px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="block font-medium mb-1">Status</span>
          <select
            aria-label="Status"
            value={status ?? r.status}
            disabled={!canWrite}
            onChange={(e) => setStatus(e.target.value as "ACTIVE" | "INACTIVE")}
            className="rounded-btn border border-border px-3 py-2"
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
        <label className="block">
          <span className="block font-medium mb-1">Notes</span>
          <textarea
            aria-label="Notes"
            value={notes ?? r.notes ?? ""}
            disabled={!canWrite}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-btn border border-border px-3 py-2"
          />
        </label>
        {canWrite && (
          <button
            type="button"
            disabled={savingRoom}
            onClick={saveDetails}
            className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-text-inverted disabled:opacity-40 cursor-pointer"
          >
            Save room
          </button>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-text-primary">Relay channels</h2>
        <ChannelPicker
          deviceIds={relayDevices}
          assignments={assignments.data ?? []}
          roomId={roomId}
          selected={current}
          disabled={!canWrite}
          onChange={setPicked}
        />
        {canWrite && (
          <button
            type="button"
            disabled={savingChannels}
            onClick={saveChannels}
            className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-text-inverted disabled:opacity-40 cursor-pointer"
          >
            Save channels
          </button>
        )}
      </div>

      {message && (
        <p
          className={`rounded-btn px-3 py-2 text-sm ${message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}
          role={message.kind === "ok" ? "status" : "alert"}
        >
          {message.text}
        </p>
      )}
    </>
  );
};

export const RoomDetailPage = () => {
  const { roomId } = useParams<{ roomId: string }>();
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <Link to="/rooms" className="hover:text-text-primary transition-colors">Rooms</Link>
        <span>/</span>
        <span className="text-text-primary">Room</span>
      </div>
      {roomId && <RoomDetail roomId={roomId} />}
    </div>
  );
};
