import { CommandStatusPill } from "@features/commands/components/CommandStatusPill";
import type { DashboardAlert } from "@features/dashboard/hooks/useDashboard";
import { formatIst } from "@shared/utils/time";

const headline = (a: DashboardAlert): string => {
  switch (a.kind) {
    case "OFFLINE":
      return `${a.deviceId} is offline`;
    case "STALE":
      return `${a.deviceId}: no recent data`;
    case "RTC_INVALID":
      return `${a.deviceId}: real-time clock is not valid`;
    case "COMMAND": {
      const p = a.command?.params ?? {};
      const what =
        a.command?.action === "SET_RELAY"
          ? `relay ${String(p["relay"])} ${String(p["state"])}`
          : a.command?.action === "SET_ALL_RELAYS"
            ? `all relays ${String(p["state"])}`
            : (a.command?.action ?? "command");
      return `${a.deviceId}: ${what}`;
    }
  }
};

export const DashboardAlerts = ({ alerts }: { alerts: DashboardAlert[] }) => (
  <section className="rounded-card bg-surface border border-border shadow-sm p-4">
    <h2 className="text-sm font-semibold text-text-primary mb-2">Alerts</h2>
    {alerts.length === 0 ? (
      <p className="text-sm text-text-secondary" data-testid="no-alerts">
        No alerts.
      </p>
    ) : (
      <ul className="divide-y divide-border" data-testid="alerts-list">
        {alerts.map((a) => (
          <li
            key={a.id}
            className="py-2 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
            data-testid={`alert-${a.kind}`}
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-text-primary">{headline(a)}</span>
              {a.command && <CommandStatusPill command={a.command} />}
            </span>
            <span className="text-xs text-text-secondary shrink-0">
              {formatIst(a.at)}
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
);
