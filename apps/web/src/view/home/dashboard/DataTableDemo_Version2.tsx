import DataTable, { type Action, type BulkAction, type Column } from "@/shared/components/ui/DataTable";
import { useState } from "react";

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */
interface Employee {
  [key: string]: unknown;
  id: number;
  name: string;
  email: string;
  role: string;
  department: string;
  status: "Active" | "Inactive" | "On Leave";
  salary: number;
  joined: string;
}

/* ─────────────────────────────────────────
   50 rows of demo data
───────────────────────────────────────── */
const SEED_DATA: Employee[] = [
  { id: 1, name: "Alice Martin", email: "alice@acme.com", role: "Engineer", department: "Engineering", status: "Active", salary: 95000, joined: "2021-03-15" },
  { id: 2, name: "Bob Chen", email: "bob@acme.com", role: "Designer", department: "Design", status: "Active", salary: 88000, joined: "2020-07-01" },
  { id: 3, name: "Carol Davis", email: "carol@acme.com", role: "Manager", department: "Engineering", status: "Active", salary: 115000, joined: "2019-01-20" },
  { id: 4, name: "Dan Smith", email: "dan@acme.com", role: "Analyst", department: "Finance", status: "Inactive", salary: 72000, joined: "2022-09-10" },
  { id: 5, name: "Eva Brown", email: "eva@acme.com", role: "Engineer", department: "Engineering", status: "Active", salary: 98000, joined: "2021-11-05" },
  { id: 6, name: "Frank Lee", email: "frank@acme.com", role: "HR Specialist", department: "HR", status: "On Leave", salary: 67000, joined: "2020-04-18" },
  { id: 7, name: "Grace Kim", email: "grace@acme.com", role: "Engineer", department: "Engineering", status: "Active", salary: 102000, joined: "2018-06-30" },
  { id: 8, name: "Henry Wang", email: "henry@acme.com", role: "Sales Rep", department: "Sales", status: "Active", salary: 79000, joined: "2023-02-14" },
  { id: 9, name: "Isla Thompson", email: "isla@acme.com", role: "Designer", department: "Design", status: "Inactive", salary: 84000, joined: "2021-08-22" },
  { id: 10, name: "Jack Wilson", email: "jack@acme.com", role: "Manager", department: "Sales", status: "Active", salary: 120000, joined: "2017-12-01" },
  { id: 11, name: "Karen White", email: "karen@acme.com", role: "Analyst", department: "Finance", status: "Active", salary: 76000, joined: "2022-05-09" },
  { id: 12, name: "Leo Harris", email: "leo@acme.com", role: "Engineer", department: "Engineering", status: "Active", salary: 91000, joined: "2020-10-11" },
  { id: 13, name: "Mia Clark", email: "mia@acme.com", role: "HR Specialist", department: "HR", status: "On Leave", salary: 64000, joined: "2023-07-03" },
  { id: 14, name: "Nathan Lewis", email: "nathan@acme.com", role: "Sales Rep", department: "Sales", status: "Active", salary: 81000, joined: "2021-01-17" },
  { id: 15, name: "Olivia Hall", email: "olivia@acme.com", role: "Engineer", department: "Engineering", status: "Active", salary: 99000, joined: "2019-09-25" },
  { id: 16, name: "Paul Young", email: "paul@acme.com", role: "Designer", department: "Design", status: "Active", salary: 86000, joined: "2020-03-08" },
  { id: 17, name: "Quinn Allen", email: "quinn@acme.com", role: "Manager", department: "Finance", status: "Inactive", salary: 110000, joined: "2018-11-14" },
  { id: 18, name: "Rachel Scott", email: "rachel@acme.com", role: "Analyst", department: "Engineering", status: "Active", salary: 74000, joined: "2022-08-30" },
  { id: 19, name: "Sam Turner", email: "sam@acme.com", role: "Sales Rep", department: "Sales", status: "Active", salary: 77000, joined: "2021-06-19" },
  { id: 20, name: "Tina Nelson", email: "tina@acme.com", role: "Engineer", department: "Engineering", status: "On Leave", salary: 93000, joined: "2020-02-27" },
  { id: 21, name: "Uma Carter", email: "uma@acme.com", role: "HR Specialist", department: "HR", status: "Active", salary: 68000, joined: "2023-04-12" },
  { id: 22, name: "Victor Mitchell", email: "victor@acme.com", role: "Engineer", department: "Engineering", status: "Active", salary: 104000, joined: "2019-07-08" },
  { id: 23, name: "Wendy Perez", email: "wendy@acme.com", role: "Designer", department: "Design", status: "Inactive", salary: 82000, joined: "2021-12-01" },
  { id: 24, name: "Xander Roberts", email: "xander@acme.com", role: "Analyst", department: "Finance", status: "Active", salary: 78000, joined: "2022-01-15" },
  { id: 25, name: "Yara Evans", email: "yara@acme.com", role: "Manager", department: "HR", status: "Active", salary: 118000, joined: "2017-05-20" },
  { id: 26, name: "Zoe Edwards", email: "zoe@acme.com", role: "Sales Rep", department: "Sales", status: "Active", salary: 80000, joined: "2020-09-03" },
  { id: 27, name: "Aaron Collins", email: "aaron@acme.com", role: "Engineer", department: "Engineering", status: "Active", salary: 97000, joined: "2021-04-27" },
  { id: 28, name: "Bella Stewart", email: "bella@acme.com", role: "Designer", department: "Design", status: "On Leave", salary: 87000, joined: "2019-10-16" },
  { id: 29, name: "Carlos Sanchez", email: "carlos@acme.com", role: "Analyst", department: "Finance", status: "Active", salary: 73000, joined: "2022-11-29" },
  { id: 30, name: "Diana Morris", email: "diana@acme.com", role: "Engineer", department: "Engineering", status: "Active", salary: 100000, joined: "2018-03-11" },
  { id: 31, name: "Ethan Rogers", email: "ethan@acme.com", role: "HR Specialist", department: "HR", status: "Inactive", salary: 65000, joined: "2023-06-05" },
  { id: 32, name: "Fiona Reed", email: "fiona@acme.com", role: "Sales Rep", department: "Sales", status: "Active", salary: 83000, joined: "2020-12-20" },
  { id: 33, name: "George Cook", email: "george@acme.com", role: "Manager", department: "Engineering", status: "Active", salary: 122000, joined: "2016-08-07" },
  { id: 34, name: "Hannah Morgan", email: "hannah@acme.com", role: "Analyst", department: "Finance", status: "Active", salary: 75000, joined: "2021-09-14" },
  { id: 35, name: "Ian Bell", email: "ian@acme.com", role: "Engineer", department: "Engineering", status: "On Leave", salary: 96000, joined: "2019-04-02" },
  { id: 36, name: "Julia Murphy", email: "julia@acme.com", role: "Designer", department: "Design", status: "Active", salary: 89000, joined: "2022-03-18" },
  { id: 37, name: "Kevin Bailey", email: "kevin@acme.com", role: "Sales Rep", department: "Sales", status: "Active", salary: 78500, joined: "2021-07-30" },
  { id: 38, name: "Laura Rivera", email: "laura@acme.com", role: "Engineer", department: "Engineering", status: "Inactive", salary: 92000, joined: "2020-01-06" },
  { id: 39, name: "Mike Cooper", email: "mike@acme.com", role: "HR Specialist", department: "HR", status: "Active", salary: 66000, joined: "2023-08-22" },
  { id: 40, name: "Nina Richardson", email: "nina@acme.com", role: "Analyst", department: "Finance", status: "Active", salary: 77500, joined: "2022-06-10" },
  { id: 41, name: "Oscar Cox", email: "oscar@acme.com", role: "Manager", department: "Sales", status: "Active", salary: 116000, joined: "2018-09-28" },
  { id: 42, name: "Penny Howard", email: "penny@acme.com", role: "Engineer", department: "Engineering", status: "Active", salary: 103000, joined: "2019-12-15" },
  { id: 43, name: "Ray Ward", email: "ray@acme.com", role: "Designer", department: "Design", status: "On Leave", salary: 85000, joined: "2021-05-04" },
  { id: 44, name: "Sara Torres", email: "sara@acme.com", role: "Sales Rep", department: "Sales", status: "Active", salary: 81500, joined: "2020-08-17" },
  { id: 45, name: "Tom Peterson", email: "tom@acme.com", role: "Analyst", department: "Finance", status: "Inactive", salary: 71000, joined: "2022-10-03" },
  { id: 46, name: "Ursula Gray", email: "ursula@acme.com", role: "Engineer", department: "Engineering", status: "Active", salary: 94000, joined: "2020-05-24" },
  { id: 47, name: "Vince Ramirez", email: "vince@acme.com", role: "HR Specialist", department: "HR", status: "Active", salary: 69000, joined: "2023-01-09" },
  { id: 48, name: "Willa James", email: "willa@acme.com", role: "Manager", department: "Design", status: "Active", salary: 113000, joined: "2017-03-30" },
  { id: 49, name: "Xavier Watson", email: "xavier@acme.com", role: "Engineer", department: "Engineering", status: "Active", salary: 101000, joined: "2019-06-13" },
  { id: 50, name: "Yusuf Brooks", email: "yusuf@acme.com", role: "Sales Rep", department: "Sales", status: "Active", salary: 82500, joined: "2021-10-28" },
];

/* ─────────────────────────────────────────
   Confirmation Modal
───────────────────────────────────────── */
interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal = ({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}: ConfirmModalProps) => {
  if (!open) return null;
  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      {/* Dim overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-6 flex flex-col gap-5 animate-[fadeInScale_150ms_ease-out]">
        {/* Icon + title */}
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-red-500">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */
const STATUS_STYLES: Record<Employee["status"], string> = {
  Active: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  Inactive: "bg-red-50 text-red-600 border border-red-200",
  "On Leave": "bg-amber-50 text-amber-700 border border-amber-200",
};

const StatusBadge = ({ status }: { status: Employee["status"] }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
    {status}
  </span>
);

const COLUMNS: Column<Employee>[] = [
  {
    key: "id", header: "ID", width: 60, sortable: true, align: "center",
    render: (v) => <span className="text-xs text-gray-400 font-mono">#{v as number}</span>,
  },
  {
    key: "name", header: "Name", sortable: true,
    render: (v, row) => (
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full bg-chikishaa/10 text-chikishaa text-xs font-bold flex items-center justify-center shrink-0">
          {(v as string).split(" ").map((n) => n[0]).join("")}
        </div>
        <div>
          <p className="font-medium text-gray-800 text-xs">{v as string}</p>
          <p className="text-[10px] text-gray-400">{row.email}</p>
        </div>
      </div>
    ),
  },
  { key: "role", header: "Role", sortable: true },
  { key: "department", header: "Department", sortable: true },
  {
    key: "status", header: "Status", sortable: true,
    render: (v) => <StatusBadge status={v as Employee["status"]} />,
  },
  {
    key: "salary", header: "Salary", sortable: true, align: "right",
    render: (v) => <span className="font-medium text-gray-700">${(v as number).toLocaleString()}</span>,
  },
  {
    key: "joined", header: "Joined", sortable: true,
    render: (v) => new Date(v as string).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
  },
];

/* ─────────────────────────────────────────
   Icons
───────────────────────────────────────── */
const IconEdit = (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
  </svg>
);
const IconDelete = (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 7a1 1 0 112 0v4a1 1 0 11-2 0V9zm4 0a1 1 0 112 0v4a1 1 0 11-2 0V9z" clipRule="evenodd" />
  </svg>
);
const IconExport = (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
);
const IconMail = (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
  </svg>
);
const IconArchive = (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" />
    <path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
  </svg>
);

const PAGE_SIZE = 10;

/* ─────────────────────────────────────────
   Demo page
───────────────────────────────────────── */
export default function DataTableDemo() {
  /* live data — bulk delete actually removes rows */
  const [dataA, setDataA] = useState<Employee[]>(SEED_DATA);
  const [pageA, setPageA] = useState(1);
  const [pageB, setPageB] = useState(1);
  const [serverLog, setServerLog] = useState<string[]>([]);
  const [bulkLog, setBulkLog] = useState<string[]>([]);

  /* ── Confirmation modal state ── */
  const [modal, setModal] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
  }>({ open: false, title: "", description: "", confirmLabel: "Delete", onConfirm: () => { } });

  const closeModal = () => setModal((m) => ({ ...m, open: false }));

  const confirm = (opts: Omit<typeof modal, "open">) =>
    setModal({ open: true, ...opts });

  /* ── Pagination slices ── */
  const sliceA = dataA.slice((pageA - 1) * PAGE_SIZE, pageA * PAGE_SIZE);
  const sliceB = SEED_DATA.slice((pageB - 1) * PAGE_SIZE, pageB * PAGE_SIZE);

  /* ── Per-row actions ── */
  const rowActionsA: Action<Employee>[] = [
    { label: "Edit", variant: "primary", icon: IconEdit, onClick: (r) => alert(`Edit → ${r.name}`) },
    {
      label: "Delete",
      variant: "danger",
      icon: IconDelete,
      onClick: (r) =>
        confirm({
          title: "Delete employee",
          description: `Are you sure you want to delete "${r.name}"? This action cannot be undone.`,
          confirmLabel: "Yes, delete",
          onConfirm: () => {
            setDataA((prev) => prev.filter((e) => e.id !== r.id));
            /* clamp page if last row on a page was removed */
            setPageA((p) => {
              const newTotal = dataA.length - 1;
              const maxPage = Math.max(1, Math.ceil(newTotal / PAGE_SIZE));
              return Math.min(p, maxPage);
            });
            closeModal();
          },
        }),
    },
  ];

  const rowActionsB: Action<Employee>[] = [
    { label: "Edit", variant: "primary", icon: IconEdit, onClick: (r) => alert(`Edit → ${r.name}`) },
    { label: "Delete", variant: "danger", icon: IconDelete, onClick: (r) => alert(`Delete → ${r.name}`) },
  ];

  /* ── Bulk actions ── */
  const bulkActions: BulkAction<Employee>[] = [
    {
      label: "Export",
      variant: "success",
      icon: IconExport,
      onClick: (rows) => {
        setBulkLog((p) =>
          [`[${new Date().toLocaleTimeString()}]  Export (${rows.length}) → ${rows.map((r) => r.name).join(", ")}`, ...p].slice(0, 6),
        );
      },
    },
    {
      label: "Email",
      variant: "primary",
      icon: IconMail,
      onClick: (rows) => {
        setBulkLog((p) =>
          [`[${new Date().toLocaleTimeString()}]  Email (${rows.length}) → ${rows.map((r) => r.email).join(", ")}`, ...p].slice(0, 6),
        );
      },
    },
    {
      label: "Archive",
      variant: "warning",
      icon: IconArchive,
      onClick: (rows) => {
        setBulkLog((p) =>
          [`[${new Date().toLocaleTimeString()}]  Archive (${rows.length}) → ${rows.map((r) => r.name).join(", ")}`, ...p].slice(0, 6),
        );
      },
    },
    {
      label: "Delete",
      variant: "danger",
      icon: IconDelete,
      /* ── Bulk delete → confirmation modal ── */
      onClick: (rows) =>
        confirm({
          title: `Delete ${rows.length} employee${rows.length > 1 ? "s" : ""}`,
          description: `You are about to permanently delete ${rows.length} record${rows.length > 1 ? "s" : ""}:\n${rows.map((r) => r.name).join(", ")}.\n\nThis action cannot be undone.`,
          confirmLabel: `Delete ${rows.length} record${rows.length > 1 ? "s" : ""}`,
          onConfirm: () => {
            const ids = new Set(rows.map((r) => r.id));
            setDataA((prev) => {
              const next = prev.filter((e) => !ids.has(e.id));
              const maxPage = Math.max(1, Math.ceil(next.length / PAGE_SIZE));
              setPageA((p) => Math.min(p, maxPage));
              return next;
            });
            setBulkLog((p) =>
              [`[${new Date().toLocaleTimeString()}]  Deleted (${rows.length}) → ${rows.map((r) => r.name).join(", ")}`, ...p].slice(0, 6),
            );
            closeModal();
          },
        }),
    },
  ];

  const handleServerSearch = (qs: string, params: Record<string, string>) => {
    if (!qs) return;
    setServerLog((p) =>
      [`[${new Date().toLocaleTimeString()}]  ${qs}`, ...p].slice(0, 8),
    );
    console.log("Server search params:", params);
  };

  return (
    <>
      {/* ── Confirmation modal (portal-like, sits above everything) ── */}
      <ConfirmModal
        open={modal.open}
        title={modal.title}
        description={modal.description}
        confirmLabel={modal.confirmLabel}
        onConfirm={modal.onConfirm}
        onCancel={closeModal}
      />

      <div className="min-h-screen bg-gray-100 p-6 sm:p-10 space-y-10">
        <div>
          <h1 className="text-xl font-bold text-gray-800">DataTable — Demo</h1>
          <p className="text-sm text-gray-500 mt-1">
            Bulk delete confirmation · active page fix · go-to-page input (Table A only)
          </p>
        </div>

        {/* ── Table A: bulk ON + client search + go-to-page ── */}
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">
              Table A —{" "}
              <span className="text-emerald-600">bulkActions enabled</span>
              {" · "}
              <span className="text-blue-600">searchMode="client"</span>
              {" · "}
              <span className="text-violet-600">showGoToPage enabled</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Bulk delete and single-row delete both open a confirmation modal.
              Deleted rows are removed from the live dataset.
            </p>
          </div>

          <DataTable<Employee>
            title="Employees"
            subtitle={`${dataA.length} records · client-side search · bulk actions`}
            columns={COLUMNS}
            data={sliceA}
            actions={rowActionsA}
            bulkActions={bulkActions}
            searchable
            searchMode="client"
            stickyHeader
            emptyMessage="No employees match your search"
            pagination={{
              page: pageA,
              pageSize: PAGE_SIZE,
              total: dataA.length,
              onChange: setPageA,
              showGoToPage: true,   // ← enabled for Table A
            }}
          />

          {bulkLog.length > 0 && (
            <div className="bg-gray-900 rounded-2xl p-5 space-y-1.5">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Bulk action log</p>
              {bulkLog.map((e, i) => (
                <code key={i} className="block text-xs font-mono text-emerald-400">{e}</code>
              ))}
            </div>
          )}
        </section>

        {/* ── Table B: bulk OFF + server search + no go-to-page ── */}
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">
              Table B —{" "}
              <span className="text-red-500">bulkActions disabled</span>
              {" · "}
              <span className="text-purple-600">searchMode="server"</span>
              {" · "}
              <span className="text-gray-400">showGoToPage disabled (default)</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              No checkboxes, no bulk bar. Server search builds a live query string on every keystroke.
            </p>
          </div>

          <DataTable<Employee>
            title="Employees"
            subtitle="Server-side search · no bulk actions · no go-to-page"
            columns={COLUMNS}
            data={sliceB}
            actions={rowActionsB}
            /* bulkActions intentionally omitted */
            searchable
            searchMode="server"
            onServerSearch={handleServerSearch}
            stickyHeader
            emptyMessage="No employees match your search"
            pagination={{
              page: pageB,
              pageSize: PAGE_SIZE,
              total: SEED_DATA.length,
              onChange: setPageB,
              showGoToPage: false,  // ← disabled for Table B (also the default)
            }}
          />

          {serverLog.length > 0 && (
            <div className="bg-gray-900 rounded-2xl p-5 space-y-1.5">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Server search log</p>
              {serverLog.map((e, i) => (
                <code key={i} className="block text-xs font-mono text-purple-400">{e}</code>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}