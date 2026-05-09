import type { Device } from "@appTypes/device.types";

type StatusType = Device["status"] | "all";

interface StatusBadgeProps {
  status: StatusType;
  size?: "sm" | "md";
}

const statusConfig: Record<string, { dot: string; label: string; badge: string }> = {
  online: {
    dot: "bg-emerald-500",
    label: "Online",
    badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  },
  offline: {
    dot: "bg-slate-400",
    label: "Offline",
    badge: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  },
  error: {
    dot: "bg-rose-500 animate-pulse",
    label: "Error",
    badge: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  },
};

export const StatusBadge = ({ status, size = "md" }: StatusBadgeProps) => {
  const cfg = statusConfig[status] ?? statusConfig.offline;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${cfg.badge} ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};
