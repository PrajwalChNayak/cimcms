import { useCreateRoomMutation, useListRoomsQuery } from "@api/roomApi";
import { RoomFormModal } from "@features/rooms/components/RoomFormModal";
import { usePermission } from "@shared/hooks/usePermission";
import { extractErrorMessage } from "@shared/utils/errorUtils";
import { useState } from "react";
import { Link } from "react-router-dom";

export const RoomsPage = () => {
  const canWrite = usePermission("ROOM_WRITE");
  const { data, isLoading, isError, refetch } = useListRoomsQuery({ limit: 100 });
  const [create, { isLoading: creating }] = useCreateRoomMutation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Rooms</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Cultivation rooms and the relays assigned to them.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
            className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-text-inverted cursor-pointer"
          >
            Create room
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-text-secondary" role="status">Loading rooms…</p>}
      {isError && (
        <div className="rounded-btn px-4 py-3 text-sm bg-rose-50 text-rose-700" role="alert">
          Could not load rooms.{" "}
          <button type="button" className="underline cursor-pointer" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      )}
      {data && data.data.length === 0 && (
        <p className="text-sm text-text-secondary">No rooms yet.</p>
      )}

      {data && data.data.length > 0 && (
        <div className="rounded-card border border-border bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-text-secondary">
              <tr>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Relays</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((room) => (
                <tr key={room.id} className="border-t border-border" data-testid={`room-row-${room.code}`}>
                  <td className="px-4 py-2 font-mono">{room.code}</td>
                  <td className="px-4 py-2">
                    <Link to={`/rooms/${room.id}`} className="text-primary hover:underline">
                      {room.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{room.status === "ACTIVE" ? "Active" : "Inactive"}</td>
                  <td className="px-4 py-2">{room.channelCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RoomFormModal
        isOpen={open}
        error={error}
        busy={creating}
        onClose={() => setOpen(false)}
        onSubmit={(body) => {
          setError(null);
          create(body)
            .unwrap()
            .then(() => setOpen(false))
            .catch((e: unknown) => setError(extractErrorMessage(e, "Could not create the room")));
        }}
      />
    </div>
  );
};
