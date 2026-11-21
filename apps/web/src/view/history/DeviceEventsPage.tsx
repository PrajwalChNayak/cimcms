import type { DeviceEventDto } from "@cimcms/contracts";
import { FilterBar, type FilterField } from "@features/history/components/FilterBar";
import {
  EVENT_TYPE_OPTIONS,
  useEventHistory,
} from "@features/history/hooks/useHistory";
import { DataTable, type Column } from "@shared/components/ui/DataTable";
import { formatIst } from "@shared/utils/time";
import { Link, useParams } from "react-router-dom";

const FIELDS: FilterField<"type" | "from" | "to">[] = [
  { key: "type", label: "Type", type: "select", options: EVENT_TYPE_OPTIONS },
  { key: "from", label: "From (IST date)", type: "date" },
  { key: "to", label: "To (IST date)", type: "date" },
];

const summary = (data: DeviceEventDto["data"]): string =>
  Object.entries(data ?? {})
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(", ");

const COLUMNS: Column<DeviceEventDto>[] = [
  { key: "receivedAt", header: "Time (IST)", render: (v) => formatIst(String(v)) },
  { key: "type", header: "Type" },
  { key: "origin", header: "Origin" },
  { key: "data", header: "Details", render: (_v, row) => summary(row.data) || "—" },
];

export const DeviceEventsPage = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const h = useEventHistory(deviceId);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <Link to="/devices" className="hover:text-text-primary">Devices</Link>
        <span>/</span>
        <Link to={`/devices/${deviceId ?? ""}`} className="hover:text-text-primary">
          {h.device?.name ?? deviceId}
        </Link>
        <span>/</span>
        <span className="text-text-primary">Events</span>
      </div>
      <h1 className="text-xl font-bold text-text-primary">Event history</h1>

      {h.notFound ? (
        <p className="text-sm text-text-secondary">Device not found</p>
      ) : (
        <>
          <FilterBar
            key={JSON.stringify(h.filters)}
            fields={FIELDS}
            values={h.filters}
            onApply={h.setFilters}
          />
          {h.isError && (
            <div className="rounded-btn px-4 py-3 text-sm bg-rose-50 text-rose-700" role="alert">
              Could not load events.{" "}
              <button type="button" className="underline cursor-pointer" onClick={() => void h.refetch()}>
                Retry
              </button>
            </div>
          )}
          <DataTable<DeviceEventDto>
            columns={COLUMNS}
            data={h.rows}
            loading={h.loading}
            emptyMessage="No events found."
            pagination={{
              page: h.page,
              pageSize: h.pageSize,
              total: h.total,
              onChange: h.setPage,
            }}
          />
        </>
      )}
    </div>
  );
};
