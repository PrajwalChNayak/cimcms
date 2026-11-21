/**
 * DataTable — fully reusable, dynamic table component (TypeScript)
 *
 * Props
 * ─────────────────────────────────────────────────────────────────
 * columns        Column<T>[]         Column definitions
 * data           T[]                 Row objects
 * actions        Action<T>[]         Per-row action buttons
 * bulkActions    BulkAction<T>[]     Bulk action buttons (enables checkboxes automatically)
 * pagination     PaginationConfig    { page, pageSize, total, onChange, showGoToPage? }
 * loading        boolean             Show skeleton loader
 * emptyMessage   string              Custom empty state text
 * stickyHeader   boolean             Freeze header on scroll
 * searchable     boolean             Show built-in search input
 * searchMode     'client'|'server'   Which search UI to show — controlled by prop
 * onServerSearch fn                  Called with (queryString, params) on server search
 * onSortChange   fn                  Called with (key, dir) when header clicked
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from "react";

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */
type SortDir = "asc" | "desc";
type ActionVariant = "primary" | "danger" | "ghost" | "success" | "warning";
type Align = "left" | "center" | "right";
type SearchMode = "client" | "server";

export interface Column<T> {
  key: keyof T & string;
  header: ReactNode;
  render?: (value: T[keyof T], row: T, rowIdx: number) => ReactNode;
  sortable?: boolean;
  isSearchable?: boolean;
  width?: number | string;
  align?: Align;
}

export interface Action<T> {
  label: string;
  icon?: ReactNode;
  onClick: (row: T) => void;
  variant?: ActionVariant;
}

export interface BulkAction<T> {
  label: string;
  icon?: ReactNode;
  onClick: (selectedRows: T[]) => void;
  variant?: ActionVariant;
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  /**
   * When true, renders a "Go to page" input next to the page buttons.
   * Defaults to false.
   */
  showGoToPage?: boolean;
}

export interface DataTableProps<T> {
  columns?: Column<T>[];
  data?: T[];
  actions?: Action<T>[];
  bulkActions?: BulkAction<T>[];
  pagination?: PaginationConfig;
  loading?: boolean;
  emptyMessage?: string;
  stickyHeader?: boolean;
  searchable?: boolean;
  searchMode?: SearchMode;
  onServerSearch?: (queryString: string, params: Record<string, string>) => void;
  onSortChange?: (key: string, dir: SortDir) => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  headerExtra?: ReactNode;
}

/* ─────────────────────────────────────────
   Variant map
───────────────────────────────────────── */
const ACTION_VARIANTS: Record<ActionVariant, string> = {
  primary: "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200",
  success: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200",
  danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200",
  ghost: "bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200",
  warning: "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200",
};

/* ─────────────────────────────────────────
   Sort icon
───────────────────────────────────────── */
const SortIcon: FC<{ active: boolean; dir: SortDir }> = ({ active, dir }) => (
  <span className="inline-flex flex-col ml-1 gap-[2px]">
    <svg viewBox="0 0 8 5" className={`w-2 h-2 transition-colors ${active && dir === "asc" ? "text-chikishaa" : "text-gray-300"}`} fill="currentColor">
      <path d="M4 0L8 5H0z" />
    </svg>
    <svg viewBox="0 0 8 5" className={`w-2 h-2 transition-colors ${active && dir === "desc" ? "text-chikishaa" : "text-gray-300"}`} fill="currentColor">
      <path d="M4 5L0 0h8z" />
    </svg>
  </span>
);

/* ─────────────────────────────────────────
   Skeleton row
───────────────────────────────────────── */
const SkeletonRow: FC<{ cols: number }> = ({ cols }) => (
  <tr className="animate-pulse border-b border-gray-100">
    {Array.from({ length: cols }, (_, i) => (
      <td key={i} className="px-5 py-4">
        <div className="h-3.5 bg-gray-200 rounded-full w-3/4" />
      </td>
    ))}
  </tr>
);

/* ─────────────────────────────────────────
   Empty state
───────────────────────────────────────── */
const EmptyState: FC<{ message?: string }> = ({ message }) => (
  <tr>
    <td colSpan={999}>
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
        <svg viewBox="0 0 64 64" fill="none" className="w-16 h-16 opacity-40" stroke="currentColor" strokeWidth={1.5}>
          <rect x="8" y="14" width="48" height="36" rx="4" />
          <path d="M8 24h48M20 14v10M44 14v10" strokeLinecap="round" />
          <path d="M22 36h20M22 42h12" strokeLinecap="round" />
        </svg>
        <p className="text-sm font-medium">{message ?? "No records found"}</p>
        <p className="text-xs text-gray-300">Try adjusting your search or filters</p>
      </div>
    </td>
  </tr>
);

/* ─────────────────────────────────────────
   Client search input
───────────────────────────────────────── */
const ClientSearch: FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div className="relative">
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}
      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none">
      <circle cx="9" cy="9" r="5" />
      <path d="M16 16l-3-3" strokeLinecap="round" />
    </svg>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search all columns…"
      className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-chikishaa/30 focus:border-chikishaa transition-all w-52"
    />
  </div>
);

/* ─────────────────────────────────────────
   Server search
───────────────────────────────────────── */
interface SearchField { id: number; column: string; value: string; }

const ServerSearch = <T extends object>({
  columns,
  onSearch,
}: {
  columns: Column<T>[];
  onSearch: (queryString: string, params: Record<string, string>) => void;
}) => {
  const searchableColumns = columns.filter((c) => c.isSearchable);
  const idRef = useRef(1);
  const [fields, setFields] = useState<SearchField[]>([
    { id: 0, column: searchableColumns[0]?.key ?? "", value: "" },
  ]);

  const emit = useCallback((updated: SearchField[]) => {
    const params: Record<string, string> = {};
    for (const f of updated) {
      if (f.column && f.value.trim()) params[f.column] = f.value.trim();
    }
    const qs = new URLSearchParams(params).toString();
    onSearch(qs ? `?${qs}` : "", params);
  }, [onSearch]);

  const updateField = useCallback((id: number, key: keyof SearchField, val: string) => {
    setFields((prev) => {
      const updated = prev.map((f) => (f.id === id ? { ...f, [key]: val } : f));
      emit(updated);
      return updated;
    });
  }, [emit]);

  const addField = useCallback(() => {
    const usedCols = new Set(fields.map((f) => f.column));
    const nextCol = searchableColumns.find((c) => !usedCols.has(c.key))?.key ?? searchableColumns[0]?.key ?? "";
    setFields((prev) => [...prev, { id: idRef.current++, column: nextCol, value: "" }]);
  }, [fields, searchableColumns]);

  const removeField = useCallback((id: number) => {
    setFields((prev) => {
      const updated = prev.filter((f) => f.id !== id);
      emit(updated);
      return updated;
    });
  }, [emit]);

  const preview = useMemo(() => {
    const params: Record<string, string> = {};
    for (const f of fields) {
      if (f.column && f.value.trim()) params[f.column] = f.value.trim();
    }
    const qs = new URLSearchParams(params).toString();
    return qs ? `?${qs}` : null;
  }, [fields]);

  const columnLabel = (key: string) => {
    const col = columns.find((c) => c.key === key);
    return typeof col?.header === "string" ? col.header : key;
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {fields.map((field) => (
        <div key={field.id} className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <select
              value={field.column}
              onChange={(e) => updateField(field.id, "column", e.target.value)}
              className="appearance-none pl-3 pr-7 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-chikishaa/30 focus:border-chikishaa text-gray-700 cursor-pointer transition-all"
            >
              {searchableColumns.map((col) => (
                <option key={col.key} value={col.key}>
                  {typeof col.header === "string" ? col.header : col.key}
                </option>
              ))}
            </select>
            <svg viewBox="0 0 20 20" fill="currentColor" className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>

          <div className="relative flex-1 min-w-[9rem]">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none">
              <circle cx="9" cy="9" r="5" />
              <path d="M16 16l-3-3" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={field.value}
              onChange={(e) => updateField(field.id, "value", e.target.value)}
              placeholder={`Search ${columnLabel(field.column)}…`}
              className="w-full pl-8 pr-8 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-chikishaa/30 focus:border-chikishaa transition-all"
            />
            {field.value && (
              <button type="button" onClick={() => updateField(field.id, "value", "")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors" aria-label="Clear">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>

          {fields.length > 1 && (
            <button type="button" onClick={() => removeField(field.id)} title="Remove filter"
              className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 7a1 1 0 112 0v4a1 1 0 11-2 0V9zm4 0a1 1 0 112 0v4a1 1 0 11-2 0V9z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      ))}

      {fields.length < searchableColumns.length && (
        <button type="button" onClick={addField}
          className="inline-flex items-center gap-1 text-xs text-chikishaa hover:opacity-75 font-medium transition-opacity self-start mt-0.5">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Add filter
        </button>
      )}

      {preview && (
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-gray-400 shrink-0">Query:</span>
          <code className="text-[10px] font-mono text-chikishaa bg-chikishaa/5 border border-chikishaa/10 rounded-lg px-2.5 py-1 break-all">
            {preview}
          </code>
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────
   Bulk action bar
───────────────────────────────────────── */
const BulkBar = <T extends object>({
  count,
  actions,
  onClear,
  getSelectedRows,
}: {
  count: number;
  actions: BulkAction<T>[];
  onClear: () => void;
  getSelectedRows: () => T[];
}) => (
  <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-chikishaa/5 border-b border-chikishaa/10 flex-wrap">
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-chikishaa text-white text-[10px] font-bold shrink-0">
        {count}
      </span>
      <span className="text-xs text-gray-600 font-medium">
        {count === 1 ? "row selected" : "rows selected"}
      </span>
      <button type="button" onClick={onClear}
        className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors ml-1">
        Clear
      </button>
    </div>
    <div className="flex items-center gap-1.5 flex-wrap">
      {actions.map((action, i) => (
        <button
          key={i}
          type="button"
          onClick={() => action.onClick(getSelectedRows())}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap ${ACTION_VARIANTS[action.variant ?? "ghost"]}`}
        >
          {action.icon && <span className="shrink-0 w-3.5 h-3.5">{action.icon}</span>}
          {action.label}
        </button>
      ))}
    </div>
  </div>
);

/* ─────────────────────────────────────────
   Pagination
   Fixes:
   • Active page uses explicit inline style as fallback so it always
     renders even if `bg-chikishaa` is not in the Tailwind safelist.
   • Go-to-page input — shown only when showGoToPage=true (default: false).
───────────────────────────────────────── */
const Pagination: FC<PaginationConfig> = ({
  page,
  pageSize,
  total,
  onChange,
  showGoToPage = false,
}) => {
  const [goInput, setGoInput] = useState("");

  if (!total) return null;
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  /* O(totalPages) single-pass */
  const buildPages = (): (number | "...")[] => {
    const result: (number | "...")[] = [];
    let prev = 0;
    const push = (p: number) => {
      if (p === prev) return;
      if (prev !== 0 && p - prev > 1) result.push("...");
      result.push(p);
      prev = p;
    };
    push(1);
    for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) push(p);
    if (totalPages > 1) push(totalPages);
    return result;
  };

  const handleGoTo = () => {
    const n = parseInt(goInput, 10);
    if (!isNaN(n) && n >= 1 && n <= totalPages && n !== page) {
      onChange(n);
    }
    setGoInput("");
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 bg-white text-sm text-gray-500 flex-wrap">
      {/* Result count */}
      <p className="text-xs">
        Showing{" "}
        <span className="font-semibold text-gray-700">{start}–{end}</span>
        {" "}of{" "}
        <span className="font-semibold text-gray-700">{total}</span> results
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        {/* ── Go to page ── */}
        {showGoToPage && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 whitespace-nowrap">Go to</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={goInput}
              onChange={(e) => setGoInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGoTo()}
              placeholder="pg"
              className="w-14 px-2 py-1.5 text-xs text-center border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-chikishaa/30 focus:border-chikishaa transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={handleGoTo}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Go
            </button>
            <span className="text-xs text-gray-300 select-none">·</span>
          </div>
        )}

        {/* ── Page buttons ── */}
        <div className="flex items-center gap-1">
          {/* Prev */}
          <button
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
            aria-label="Previous page"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>

          {buildPages().map((p, i) =>
            p === "..." ? (
              <span key={`e-${i}`} className="px-1 text-gray-400 text-xs select-none">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onChange(p as number)}
                aria-current={p === page ? "page" : undefined}
                /* ── FIX: inline style guarantees active highlight renders
                   even if Tailwind's JIT hasn't included bg-chikishaa ── */
                style={
                  p === page
                    ? { backgroundColor: "var(--color-chikishaa, #6366f1)", color: "#fff" }
                    : undefined
                }
                className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-medium transition-colors ${p === page
                  ? "shadow-sm ring-1 ring-inset ring-white/20"
                  : "text-gray-600 hover:bg-gray-100"
                  }`}
              >
                {p}
              </button>
            ),
          )}

          {/* Next */}
          <button
            disabled={page >= totalPages}
            onClick={() => onChange(page + 1)}
            aria-label="Next page"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────
   Main DataTable
───────────────────────────────────────── */
export const DataTable = <T extends object>({
  columns = [],
  data = [],
  actions = [],
  bulkActions,
  pagination,
  loading = false,
  emptyMessage,
  stickyHeader = false,
  searchable = false,
  searchMode = "client",
  onServerSearch,
  onSortChange,
  title,
  subtitle,
  headerExtra,
}: DataTableProps<T>) => {
  const [sort, setSort] = useState<{ key: string | null; dir: SortDir }>({ key: null, dir: "asc" });
  const [clientSearch, setClientSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const bulkEnabled = Array.isArray(bulkActions);

  useEffect(() => { setSelected(new Set()); }, [data]);

  const filtered = useMemo<T[]>(() => {
    if (searchMode !== "client" || !clientSearch.trim()) return data;
    const q = clientSearch.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const val = row[col.key];
        return val != null && String(val).toLowerCase().includes(q);
      }),
    );
  }, [data, columns, clientSearch, searchMode]);

  const sorted = useMemo<T[]>(() => {
    if (!sort.key || onSortChange) return filtered;
    const key = sort.key as keyof T;
    return [...filtered].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort, onSortChange]);

  const handleSort = useCallback((key: string) => {
    const newDir: SortDir = sort.key === key && sort.dir === "asc" ? "desc" : "asc";
    setSort({ key, dir: newDir });
    onSortChange?.(key, newDir);
  }, [sort, onSortChange]);

  const allSelected = sorted.length > 0 && selected.size === sorted.length;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      const next = new Set<number>();
      for (let i = 0; i < sorted.length; i++) next.add(i);
      setSelected(next);
    }
  }, [allSelected, sorted.length]);

  const toggleRow = useCallback((i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }, []);

  const getSelectedRows = useCallback(
    () => [...selected].map((i) => sorted[i]),
    [selected, sorted],
  );

  const colCount = columns.length + (actions.length ? 1 : 0) + (bulkEnabled ? 1 : 0);
  const showToolbar = title || subtitle || searchable || headerExtra;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
      {/* ── Toolbar ── */}
      {showToolbar && (
        <div className="flex flex-col gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              {title && <h3 className="text-sm font-semibold text-gray-800">{title}</h3>}
              {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
            </div>
            {headerExtra && <div className="flex items-center gap-3 flex-wrap">{headerExtra}</div>}
          </div>

          {searchable && (
            <div className="flex flex-col sm:flex-row sm:items-start gap-3 flex-wrap">
             

              {searchMode === "client" && (
                <ClientSearch value={clientSearch} onChange={setClientSearch} />
              )}
              {searchMode === "server" && (
                <div className="flex-1 min-w-0">
                  <ServerSearch<T> columns={columns} onSearch={onServerSearch ?? (() => { })} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Bulk bar ── */}
      {bulkEnabled && selected.size > 0 && (
        <BulkBar<T>
          count={selected.size}
          actions={bulkActions ?? []}
          onClear={() => setSelected(new Set())}
          getSelectedRows={getSelectedRows}
        />
      )}

      {/* ── Table ── */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm border-collapse">
          <thead className={`${stickyHeader ? "sticky top-0 z-10" : ""} bg-gray-50/80 backdrop-blur-sm`}>
            <tr>
              {bulkEnabled && (
                <th className="w-10 px-5 py-3.5 text-left border-b border-gray-100">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="rounded border-gray-300 text-chikishaa focus:ring-chikishaa/30 cursor-pointer" />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  className={`px-5 py-3.5 text-xs font-semibold text-gray-500 tracking-wider uppercase whitespace-nowrap border-b border-gray-100
                    ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}
                    ${col.sortable ? "cursor-pointer select-none hover:text-chikishaa transition-colors" : ""}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && <SortIcon active={sort.key === col.key} dir={sort.dir} />}
                  </span>
                </th>
              ))}
              {actions.length > 0 && (
                <th className="px-5 py-3.5 text-xs font-semibold text-gray-500 tracking-wider uppercase text-right border-b border-gray-100 whitespace-nowrap">
                  Actions
                </th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-50">
            {loading && Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} cols={colCount} />)}
            {!loading && sorted.length === 0 && <EmptyState message={emptyMessage} />}
            {!loading && sorted.map((row, rowIdx) => (
              <tr key={rowIdx}
                className={`group transition-colors duration-150 ${selected.has(rowIdx) ? "bg-chikishaa/5" : "hover:bg-gray-50/70"}`}>
                {bulkEnabled && (
                  <td className="px-5 py-4">
                    <input type="checkbox" checked={selected.has(rowIdx)} onChange={() => toggleRow(rowIdx)}
                      className="rounded border-gray-300 text-chikishaa focus:ring-chikishaa/30 cursor-pointer" />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key}
                    className={`px-5 py-4 text-gray-700 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}`}>
                    {col.render
                      ? col.render(row[col.key], row, rowIdx)
                      : (row[col.key] as ReactNode) ?? "—"}
                  </td>
                ))}
                {actions.length > 0 && (
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      {actions.map((action, aIdx) => (
                        <button key={aIdx} type="button" onClick={() => action.onClick(row)} title={action.label}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap ${ACTION_VARIANTS[action.variant ?? "ghost"]}`}>
                          {action.icon && <span className="shrink-0 w-3.5 h-3.5">{action.icon}</span>}
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && (
        <Pagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onChange={pagination.onChange}
          showGoToPage={pagination.showGoToPage}
        />
      )}
    </div>
  );
};

export default DataTable;