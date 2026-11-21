import type { DeviceEventDto, DeviceStateDto } from "@cimcms/contracts";
import { rssiLabel } from "@features/devices/utils/rssi";
import { formatIst } from "@shared/utils/time";
import type { ReactNode } from "react";

export const Card = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <div className="rounded-card bg-surface border border-border shadow-sm p-5">
    <h2 className="text-sm font-semibold text-text-primary mb-2">{title}</h2>
    {children}
  </div>
);

export const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) => (
  <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
    <span className="text-sm text-text-secondary">{label}</span>
    <span className="text-sm font-medium text-text-primary text-right">
      {value}
    </span>
  </div>
);

const yesNo = (v: boolean | null | undefined) =>
  v === null || v === undefined ? "—" : v ? "Yes" : "No";

export const ConnectivityCard = ({
  state,
}: {
  state: DeviceStateDto | null;
}) => {
  const c = state?.connectivity;
  return (
    <Card title="Connectivity">
      {!c ? (
        <p className="text-sm text-text-secondary">No connectivity data yet.</p>
      ) : (
        <div>
          <InfoRow label="Wi-Fi connected" value={yesNo(c.wifiConnected)} />
          <InfoRow label="SSID" value={c.ssid ?? "—"} />
          <InfoRow label="IP address" value={c.ip ?? "—"} />
          <InfoRow
            label="Signal (RSSI)"
            value={
              c.rssiDbm === undefined
                ? "—"
                : `${c.rssiDbm} dBm — ${rssiLabel(c.rssiDbm)}`
            }
          />
          <InfoRow label="MQTT connected" value={yesNo(c.mqttConnected)} />
        </div>
      )}
    </Card>
  );
};

export const RtcCard = ({ state }: { state: DeviceStateDto | null }) => {
  const r = state?.rtc;
  return (
    <Card title="Real-time clock">
      {!r ? (
        <p className="text-sm text-text-secondary">No RTC data yet.</p>
      ) : (
        <div>
          <InfoRow label="RTC valid" value={yesNo(r.valid)} />
          <InfoRow label="Device time" value={formatIst(r.timeUtc)} />
          <InfoRow label="Last sync" value={formatIst(r.lastSyncUtc)} />
          <InfoRow label="Sync source" value={r.syncSource ?? "—"} />
          <InfoRow label="Last sync result" value={r.lastSyncResult ?? "—"} />
          <InfoRow
            label="Drift"
            value={r.driftMs === undefined ? "—" : `${r.driftMs} ms`}
          />
          <InfoRow label="Lost power" value={yesNo(r.lostPower)} />
        </div>
      )}
    </Card>
  );
};

const eventSummary = (e: DeviceEventDto): string =>
  Object.entries(e.data ?? {})
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(", ");

export const EventsCard = ({
  events,
  isLoading,
}: {
  events: DeviceEventDto[];
  isLoading: boolean;
}) => (
  <Card title="Recent events">
    {isLoading ? (
      <p className="text-sm text-text-secondary">Loading events…</p>
    ) : events.length === 0 ? (
      <p className="text-sm text-text-secondary">No events yet.</p>
    ) : (
      <ul className="divide-y divide-border" data-testid="events-list">
        {events.map((e) => (
          <li
            key={e.id}
            className="py-2 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
          >
            <span>
              <span className="font-medium text-text-primary">{e.type}</span>
              <span className="text-text-secondary"> · {e.origin}</span>
              {eventSummary(e) && (
                <span className="text-text-secondary">
                  {" "}
                  · {eventSummary(e)}
                </span>
              )}
            </span>
            <span className="text-xs text-text-secondary shrink-0">
              {formatIst(e.receivedAt)}
            </span>
          </li>
        ))}
      </ul>
    )}
  </Card>
);
