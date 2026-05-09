interface StatCardProps {
  label: string;
  value: string | number;
  icon: string; // SVG path d attribute
  color: "primary" | "emerald" | "amber" | "rose" | "sky";
  subLabel?: string;
  trend?: { value: string; up: boolean };
}

const colorMap = {
  primary: { bg: "bg-primary/10", text: "text-primary", ring: "ring-primary/20" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", ring: "ring-emerald-500/20" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-400", ring: "ring-amber-500/20" },
  rose: { bg: "bg-rose-500/10", text: "text-rose-400", ring: "ring-rose-500/20" },
  sky: { bg: "bg-sky-500/10", text: "text-sky-400", ring: "ring-sky-500/20" },
};

export const StatCard = ({ label, value, icon, color, subLabel, trend }: StatCardProps) => {
  const c = colorMap[color];
  return (
    <div className="rounded-card bg-surface border border-border shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl ${c.bg} ring-1 ${c.ring} flex items-center justify-center`}>
          <svg className={`w-5 h-5 ${c.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
        {trend && (
          <span
            className={`text-xs font-medium flex items-center gap-0.5 ${
              trend.up ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={trend.up ? "M5 10l7-7m0 0l7 7m-7-7v18" : "M19 14l-7 7m0 0l-7-7m7 7V3"} />
            </svg>
            {trend.value}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-text-primary mb-1">{value}</div>
      <div className="text-sm text-text-secondary">{label}</div>
      {subLabel && <div className="text-xs text-text-secondary mt-0.5">{subLabel}</div>}
    </div>
  );
};
