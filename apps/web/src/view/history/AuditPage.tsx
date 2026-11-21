import type { AuditLogDto } from "@cimcms/contracts";
import { FilterBar, type FilterField } from "@features/history/components/FilterBar";
import { useAuditHistory } from "@features/history/hooks/useHistory";
import { DataTable, type Column } from "@shared/components/ui/DataTable";
import { formatIst } from "@shared/utils/time";

const FIELDS: FilterField<"action" | "entity" | "from" | "to">[] = [
  { key: "action", label: "Action", type: "text" },
  { key: "entity", label: "Entity", type: "text" },
  { key: "from", label: "From (IST date)", type: "date" },
  { key: "to", label: "To (IST date)", type: "date" },
];

const summary = (data: AuditLogDto["data"]): string =>
  Object.entries(data ?? {})
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(", ");

const COLUMNS: Column<AuditLogDto>[] = [
  { key: "at", header: "Time (IST)", render: (v) => formatIst(String(v)) },
  {
    key: "actorEmail",
    header: "Actor",
    render: (_v, row) => row.actorEmail ?? row.actorType,
  },
  { key: "action", header: "Action" },
  {
    key: "entity",
    header: "Entity",
    render: (_v, row) => (row.entityId ? `${row.entity} ${row.entityId}` : row.entity),
  },
  { key: "data", header: "Details", render: (_v, row) => summary(row.data) || "—" },
];

export const AuditPage = () => {
  const h = useAuditHistory();

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-bold text-text-primary">Audit log</h1>
      <FilterBar
        key={JSON.stringify(h.filters)}
        fields={FIELDS}
        values={h.filters}
        onApply={h.setFilters}
      />
      {h.isError && (
        <div className="rounded-btn px-4 py-3 text-sm bg-rose-50 text-rose-700" role="alert">
          Could not load the audit log.{" "}
          <button type="button" className="underline cursor-pointer" onClick={() => void h.refetch()}>
            Retry
          </button>
        </div>
      )}
      <DataTable<AuditLogDto>
        columns={COLUMNS}
        data={h.rows}
        loading={h.loading}
        emptyMessage="No audit records found."
        pagination={{
          page: h.page,
          pageSize: h.pageSize,
          total: h.total,
          onChange: h.setPage,
        }}
      />
    </div>
  );
};
