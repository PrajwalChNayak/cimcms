import type { DeviceListItemDto } from "@cimcms/contracts";
import { LivenessBadge } from "@features/devices/components/LivenessBadge";
import {
  PlannedBadge,
  SimulationBadge,
} from "@features/devices/components/SimulationBadge";
import { useLiveDeviceState } from "@features/devices/hooks/useDevices";
import {
  DEVICE_TYPE_LABEL,
  isPlannedType,
  relayCountText,
} from "@features/devices/utils/deviceTypeInfo";
import { formatIst } from "@shared/utils/time";
import { useNavigate } from "react-router-dom";

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-text-secondary">{label}</span>
    <span className="font-medium text-text-primary text-right">{value}</span>
  </div>
);

/** One device in the list. Keeps itself live through the shared state query. */
export const DeviceListCard = ({ device }: { device: DeviceListItemDto }) => {
  const navigate = useNavigate();
  const state = useLiveDeviceState(device);
  const planned = isPlannedType(device.type);

  return (
    <button
      type="button"
      onClick={() => navigate(`/devices/${device.deviceId}`)}
      className="w-full text-left rounded-card bg-surface border border-border shadow-sm p-4 hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
      data-testid={`device-card-${device.deviceId}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">
            {device.name}
          </p>
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
        <div className="space-y-1.5">
          <Field label="Last seen" value={formatIst(state?.lastSeenAt)} />
          <Field label="Firmware" value={state?.firmwareVersion ?? "—"} />
          <Field
            label="Relays ON"
            value={relayCountText(
              device.type,
              state?.relayStates,
              state?.relayOnCount,
            )}
          />
          {state?.simulationMode === true && (
            <div className="pt-1">
              <SimulationBadge />
            </div>
          )}
        </div>
      )}
    </button>
  );
};
