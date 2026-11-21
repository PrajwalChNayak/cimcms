import { useListRoomsQuery } from "@api/roomApi";
import { useListSchedulesQuery } from "@api/scheduleApi";
import { SCHEDULE_STATUS_TEXT } from "@features/schedules/scheduleText";
import { usePermission } from "@shared/hooks/usePermission";
import { Link } from "react-router-dom";

/** Schedules by room, and the rooms that still have none. */
export const SchedulesPage = () => {
  const canWrite = usePermission("SCHEDULE_WRITE");
  const schedules = useListSchedulesQuery({ limit: 100 });
  const rooms = useListRoomsQuery({ limit: 100, status: "ACTIVE" });

  const active = (schedules.data?.data ?? []).filter((s) => s.status !== "ARCHIVED");
  const roomsWithout = (rooms.data?.data ?? []).filter((r) => !active.some((s) => s.roomId === r.id));

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Schedules</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          AUTO lighting schedules per room. Times are Indian Standard Time (IST).
        </p>
      </div>

      {schedules.isLoading && <p className="text-sm text-text-secondary" role="status">Loading schedules…</p>}
      {schedules.isError && (
        <div className="rounded-btn px-4 py-3 text-sm bg-rose-50 text-rose-700" role="alert">
          Could not load schedules.
        </div>
      )}

      {active.length > 0 && (
        <div className="rounded-card border border-border bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-text-secondary">
              <tr>
                <th className="px-4 py-2">Schedule</th>
                <th className="px-4 py-2">Room</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Windows</th>
              </tr>
            </thead>
            <tbody>
              {active.map((s) => (
                <tr key={s.id} className="border-t border-border" data-testid={`schedule-row-${s.id}`}>
                  <td className="px-4 py-2">
                    <Link to={`/schedules/${s.id}`} className="text-primary hover:underline">{s.name}</Link>
                  </td>
                  <td className="px-4 py-2">{s.roomName ?? "—"}</td>
                  <td className="px-4 py-2">{SCHEDULE_STATUS_TEXT[s.status]}</td>
                  <td className="px-4 py-2">{s.latest.rules.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!schedules.isLoading && active.length === 0 && (
        <p className="text-sm text-text-secondary">No schedules yet.</p>
      )}

      {canWrite && roomsWithout.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">Rooms without a schedule</h2>
          <ul className="divide-y divide-border rounded-card border border-border bg-surface text-sm">
            {roomsWithout.map((r) => (
              <li key={r.id} className="px-4 py-2 flex items-center justify-between" data-testid={`room-without-${r.code}`}>
                <span>{r.name}</span>
                <Link to={`/schedules/new/${r.id}`} className="text-primary hover:underline">
                  Create schedule
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
