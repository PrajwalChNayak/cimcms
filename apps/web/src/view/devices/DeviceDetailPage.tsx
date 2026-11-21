import {
  Card,
  ConnectivityCard,
  EventsCard,
  InfoRow,
  RtcCard,
} from "@features/devices/components/DeviceInfoCards";
import { LivenessBadge } from "@features/devices/components/LivenessBadge";
import { RssiChart } from "@features/devices/components/RssiChart";
import {
  PlannedBadge,
  SimulationBadge,
} from "@features/devices/components/SimulationBadge";
import { useDeviceDetail } from "@features/devices/hooks/useDevices";
import {
  DEVICE_TYPE_LABEL,
  relayCountText,
} from "@features/devices/utils/deviceTypeInfo";
import { SimulationBanner } from "@features/ledControl/components/SimulationBanner";
import { formatIst, formatRelative } from "@shared/utils/time";
import { Link, useNavigate, useParams } from "react-router-dom";

export const DeviceDetailPage = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const {
    device,
    state,
    planned,
    isLoading,
    notFound,
    events,
    eventsLoading,
    rssiSeries,
  } = useDeviceDetail(deviceId);

  if (isLoading) {
    return (
      <p className="p-6 text-sm text-text-secondary" role="status">
        Loading device…
      </p>
    );
  }

  if (notFound || !device) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-20 text-center p-6">
        <p className="text-text-secondary text-sm mb-3">Device not found</p>
        <button
          type="button"
          onClick={() => navigate("/devices")}
          className="text-xs text-primary hover:underline cursor-pointer"
        >
          Back to devices
        </button>
      </div>
    );
  }

  const simulation = state?.simulationMode === true;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <Link to="/devices" className="hover:text-text-primary transition-colors">
          Devices
        </Link>
        <span>/</span>
        <span className="text-text-primary">{device.name}</span>
      </div>

      {simulation && <SimulationBanner />}

      {/* Header + state summary */}
      <div className="rounded-card bg-surface border border-border shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-text-primary">
              {device.name}
            </h1>
            <p className="text-sm text-text-secondary">
              {DEVICE_TYPE_LABEL[device.type]} · {device.deviceId}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {planned ? (
              <PlannedBadge />
            ) : (
              <LivenessBadge liveness={state?.liveness} />
            )}
            {simulation && <SimulationBadge />}
          </div>
        </div>

        {planned ? (
          <p className="mt-4 text-sm text-text-secondary">
            This device type is planned and not available yet.
          </p>
        ) : (
          <div className="mt-4">
            <InfoRow
              label="Last seen"
              value={`${formatIst(state?.lastSeenAt)} (${formatRelative(state?.lastSeenAt)})`}
            />
            <InfoRow label="Firmware" value={state?.firmwareVersion ?? "—"} />
            <InfoRow label="Mode" value={state?.mode ?? "—"} />
            <InfoRow
              label="Relays ON"
              value={relayCountText(
                device.type,
                state?.relayStates,
                state?.relayOnCount,
              )}
            />
            <InfoRow label="Last update" value={formatIst(state?.updatedAt)} />
          </div>
        )}

        {!planned && (
          <div className="mt-3 flex gap-4 text-sm">
            <Link to={`/devices/${device.deviceId}/commands`} className="text-primary hover:underline">
              Command history
            </Link>
            <Link to={`/devices/${device.deviceId}/events`} className="text-primary hover:underline">
              Event history
            </Link>
          </div>
        )}

        {!planned && device.type === "LED_CONTROLLER" && (
          <div className="mt-4">
            <Link
              to={`/devices/${device.deviceId}/control`}
              className="inline-flex items-center rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-text-inverted hover:bg-primary-light transition-colors"
            >
              Open control page
            </Link>
          </div>
        )}
      </div>

      {!planned && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ConnectivityCard state={state} />
            <RtcCard state={state} />
          </div>

          <Card title="Wi-Fi signal (RSSI), last 24 h">
            <RssiChart data={rssiSeries} />
          </Card>

          <EventsCard events={events} isLoading={eventsLoading} />
        </>
      )}
    </div>
  );
};
