import { CommandStatusPill } from "@features/commands/components/CommandStatusPill";
import { FilterBar, type FilterField } from "@features/history/components/FilterBar";
import {
  COMMAND_STATUS_OPTIONS,
  useCommandHistory,
  type CommandRow,
} from "@features/history/hooks/useHistory";
import { DataTable, type Column } from "@shared/components/ui/DataTable";
import { formatIst } from "@shared/utils/time";
import { Link, useParams } from "react-router-dom";

const FIELDS: FilterField<"status">[] = [
  { key: "status", label: "Status", type: "select", options: COMMAND_STATUS_OPTIONS },
];

const COLUMNS: Column<CommandRow>[] = [
  { key: "time", header: "Time (IST)", render: (v) => formatIst(String(v)) },
  { key: "user", header: "User" },
  { key: "action", header: "Action" },
  { key: "relay", header: "Relay" },
  { key: "requested", header: "Requested state" },
  {
    key: "command",
    header: "Status",
    render: (_v, row) => <CommandStatusPill command={row.command} />,
  },
  { key: "reason", header: "Reason", render: (v) => String(v) || "—" },
  { key: "latency", header: "Latency", align: "right" },
];

export const DeviceCommandsPage = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const h = useCommandHistory(deviceId);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <Link to="/devices" className="hover:text-text-primary">Devices</Link>
        <span>/</span>
        <Link to={`/devices/${deviceId ?? ""}`} className="hover:text-text-primary">
          {h.device?.name ?? deviceId}
        </Link>
        <span>/</span>
        <span className="text-text-primary">Commands</span>
      </div>
      <h1 className="text-xl font-bold text-text-primary">Command history</h1>

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
              Could not load commands.{" "}
              <button type="button" className="underline cursor-pointer" onClick={() => void h.refetch()}>
                Retry
              </button>
            </div>
          )}
          <DataTable<CommandRow>
            columns={COLUMNS}
            data={h.rows}
            loading={h.loading}
            emptyMessage="No commands found."
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
