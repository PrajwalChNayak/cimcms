import { LivenessBadge } from "@features/devices/components/LivenessBadge";
import {
  PlannedBadge,
  SimulationBadge,
} from "@features/devices/components/SimulationBadge";
import {
  DEVICE_TYPE_LABEL,
  relayCountText,
} from "@features/devices/utils/deviceTypeInfo";
import { rssiLabel } from "@features/devices/utils/rssi";
import type { DashboardDevice } from "@features/dashboard/hooks/useDashboard";
import { formatIst, formatRelative } from "@shared/utils/time";
import { Link } from "react-router-dom";

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between text-xs gap-2">
    <span className="text-text-secondary">{label}</span>
    <span className="font-medium text-text-primary text-right">{value}</span>
  </div>
);

const yesNo = (v: boolean | null | undefined) =>
  v === null || v === undefined ? "—" : v ? "Yes" : "No";

/** One device on the dashboard. The state is already live (see useDashboard). */
export const DashboardDeviceCard = ({ item }: { item: DashboardDevice }) => {
  const { device, planned, state } = item;
  const c = state?.connectivity;
  const rtc = state?.rtc;

  return (
    <div
      className="rounded-card bg-surface border border-border shadow-sm p-4 space-y-3"
      data-testid={`dash-device-${device.deviceId}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={`/devices/${device.deviceId}`}
            className="text-sm font-semibold text-text-primary hover:underline truncate block"
          >
            {device.name}
          </Link>
          <p className="text-xs text-text-secondary">
            {DEVICE_TYPE_LABEL[device.type]} · {device.deviceId}
          </p>
        </div>
        {planned ? <PlannedBadge /> : <LivenessBadge liveness={state?.liveness} />}
      </div>

      {planned ? (
        <p className="text-xs text-text-secondary">
          Not yet available. This device type is planned.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <Row
              label="Last seen"
              value={
                state?.lastSeenAt
                  ? `${formatIst(state.lastSeenAt)} (${formatRelative(state.lastSeenAt)})`
                  : "—"
              }
            />
            <Row label="Mode" value={state?.mode ?? "—"} />
            <Row
              label="Relays ON"
              value={relayCountText(
                device.type,
                state?.relayStates,
                state?.relayOnCount,
              )}
            />
            <Row
              label="Wi-Fi"
              value={
                c
                  ? `${c.ip ?? "—"}${c.rssiDbm === undefined ? "" : ` · ${c.rssiDbm} dBm (${rssiLabel(c.rssiDbm)})`}`
                  : "—"
              }
            />
            <Row label="MQTT connected" value={yesNo(c?.mqttConnected)} />
            <Row label="RTC valid" value={yesNo(rtc?.valid)} />
            <Row label="RTC last sync" value={formatIst(rtc?.lastSyncUtc)} />
          </div>
          <div className="flex items-center justify-between">
            {state?.simulationMode === true ? <SimulationBadge /> : <span />}
            {device.type === "LED_CONTROLLER" && (
              <Link
                to={`/devices/${device.deviceId}/control`}
                className="text-xs font-medium text-primary hover:underline"
              >
                Open control
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
};
