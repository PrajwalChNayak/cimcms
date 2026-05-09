import { useNavigate } from "react-router-dom";
import type { FarmSummary } from "@appTypes/farm.types";

interface FarmCardProps {
  farm: FarmSummary;
}

export const FarmCard = ({ farm }: FarmCardProps) => {
  const navigate = useNavigate();
  const healthPct = farm.totalDevices
    ? Math.round((farm.onlineDevices / farm.totalDevices) * 100)
    : 0;

  const healthColor =
    healthPct >= 80 ? "bg-emerald-500" : healthPct >= 50 ? "bg-amber-500" : "bg-rose-500";

  return (
    <button
      type="button"
      onClick={() => navigate(`/farms/${farm.id}`)}
      className="group w-full text-left rounded-card bg-surface border border-border shadow-sm p-5 hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-text-primary text-sm group-hover:text-primary transition-colors">
              {farm.name}
            </h3>
            {farm.location && (
              <p className="text-xs text-text-secondary flex items-center gap-1 mt-0.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {farm.location}
              </p>
            )}
          </div>
        </div>
        {farm.alertCount > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full ring-1 ring-rose-500/20">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {farm.alertCount}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center">
          <div className="text-lg font-bold text-text-primary">{farm.totalDevices}</div>
          <div className="text-xs text-text-secondary">Total</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-emerald-600">{farm.onlineDevices}</div>
          <div className="text-xs text-text-secondary">Online</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-slate-500">{farm.offlineDevices}</div>
          <div className="text-xs text-text-secondary">Offline</div>
        </div>
      </div>

      {/* Health bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-secondary">Device Health</span>
          <span className="text-xs font-medium text-text-secondary">{healthPct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-border overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${healthColor}`}
            style={{ width: `${healthPct}%` }}
          />
        </div>
      </div>

      {/* Area tag */}
      {farm.area && (
        <div className="mt-3 flex items-center gap-1 text-xs text-white/30">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          {farm.area}
        </div>
      )}
    </button>
  );
};
