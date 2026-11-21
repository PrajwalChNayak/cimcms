import { ENV } from "@config/env";
import { refreshSession } from "@api/baseApi";
import { useDevices } from "@features/devices/hooks/useDevices";
import {
  REPORTS,
  downloadReport,
  validateRange,
  type ReportKind,
} from "@features/reports/reportDownload";
import { istDateEndToUtcIso, istDateStartToUtcIso } from "@shared/utils/time";
import { useStore } from "react-redux";
import { selectAuthToken } from "@store/slices/authSlice";
import type { RootState } from "@store/store";
import { useState } from "react";

const inputClass =
  "rounded-btn border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary";

export const ReportsPage = () => {
  const store = useStore<RootState>();
  const { devices } = useDevices();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [busy, setBusy] = useState<ReportKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const start = async (kind: ReportKind) => {
    setDone(null);
    const invalid = validateRange(from, to);
    setError(invalid);
    const fromIso = istDateStartToUtcIso(from);
    const toIso = istDateEndToUtcIso(to);
    if (invalid || !fromIso || !toIso) return;
    setBusy(kind);
    try {
      const name = await downloadReport({
        baseUrl: ENV.API_BASE_URL,
        kind,
        fromIso,
        toIso,
        deviceId: deviceId || undefined,
        getToken: () => selectAuthToken(store.getState()),
        refresh: () => refreshSession(store),
      });
      setDone(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-bold text-text-primary">Reports</h1>
      <p className="text-sm text-text-secondary">
        CSV exports for up to 31 days. Days are IST calendar days; every row also has a UTC column.
      </p>

      <div className="rounded-card bg-surface border border-border shadow-sm p-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          From (IST date)
          <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          To (IST date)
          <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Device
          <select className={inputClass} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">All devices</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="rounded-btn px-4 py-3 text-sm bg-rose-50 text-rose-700" role="alert">
          {error}
        </div>
      )}
      {done && (
        <div className="rounded-btn px-4 py-3 text-sm bg-emerald-50 text-emerald-700" role="status">
          Downloaded {done}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {REPORTS.map((r) => (
          <div key={r.kind} className="rounded-card bg-surface border border-border shadow-sm p-4 space-y-3">
            <div>
              <h2 className="font-semibold text-text-primary">{r.label}</h2>
              <p className="text-sm text-text-secondary">{r.description}</p>
            </div>
            <button
              type="button"
              className="rounded-btn bg-[#76B82A] px-4 py-2 text-sm text-white disabled:opacity-50 cursor-pointer"
              disabled={busy !== null}
              onClick={() => void start(r.kind)}
              aria-label={`Download ${r.label} CSV`}
            >
              {busy === r.kind ? "Preparing…" : "Download CSV"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
