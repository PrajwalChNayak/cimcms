import type { DeviceListItemDto } from "@cimcms/contracts";
import { useCommandUpdates } from "@features/commands/hooks/useCommandUpdates";
import { CommandStatusPill } from "@features/commands/components/CommandStatusPill";
import {
  commandSubmitted,
  isTerminalStatus,
  selectDeviceCommands,
} from "@features/commands/store/commandsSlice";
import { ConnectivityCard, RtcCard } from "@features/devices/components/DeviceInfoCards";
import { LivenessBadge } from "@features/devices/components/LivenessBadge";
import { useLiveDeviceState } from "@features/devices/hooks/useDevices";
import { OFFLINE_TEXT, PENDING_TEXT, STALE_TEXT } from "@features/ledControl/ledText";
import { useSyncDeviceRtcMutation } from "@features/system/api/systemApi";
import { usePermission } from "@shared/hooks/usePermission";
import { extractErrorMessage } from "@shared/utils/errorUtils";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { useState } from "react";
import { Link } from "react-router-dom";

export const WIFI_SCAN_PLANNED_TEXT =
  "Wi-Fi network scan: planned. Devices do not report scan results in contract v1.";
export const RTC_SYNC_FAILED_TO_SEND = "Clock sync was not sent";

/** RTC block, Wi-Fi block and the "Sync now" button of one device. */
export const DeviceDiagnosticsCard = ({ device }: { device: DeviceListItemDto }) => {
  const dispatch = useAppDispatch();
  const state = useLiveDeviceState(device);
  useCommandUpdates(device.deviceId, device.id);
  const canSync = usePermission("DEVICE_DIAGNOSTICS");
  const commands = useAppSelector((s) => selectDeviceCommands(s, device.deviceId));
  const last = commands.find((c) => c.action === "RTC_SYNC_NOW") ?? null;
  const [sync, { isLoading }] = useSyncDeviceRtcMutation();
  const [error, setError] = useState<string | null>(null);

  const pending = last !== null && !isTerminalStatus(last.status);
  const blockReason =
    !state || state.liveness === "OFFLINE"
      ? OFFLINE_TEXT
      : state.liveness !== "ONLINE"
        ? STALE_TEXT
        : null;

  const onSync = async () => {
    setError(null);
    try {
      const command = await sync({ deviceObjectId: device.id }).unwrap();
      dispatch(commandSubmitted(command));
    } catch (err) {
      setError(extractErrorMessage(err, RTC_SYNC_FAILED_TO_SEND));
    }
  };

  return (
    <section
      className="space-y-3 rounded-card border border-border bg-surface p-4"
      data-testid={`system-device-${device.deviceId}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-text-primary">
          <Link to={`/devices/${device.deviceId}`} className="hover:underline">
            {device.name}
          </Link>{" "}
          <span className="text-sm font-normal text-text-secondary">{device.deviceId}</span>
        </h2>
        <LivenessBadge liveness={state?.liveness} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <RtcCard state={state} />
        <ConnectivityCard state={state} />
      </div>

      <p className="text-xs text-text-secondary" data-testid="wifi-scan-planned">
        {WIFI_SCAN_PLANNED_TEXT}
      </p>

      {canSync && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={blockReason !== null || pending || isLoading}
            onClick={() => void onSync()}
            className="rounded-btn border border-border px-3 py-1.5 text-sm font-semibold text-text-primary hover:bg-background disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Sync clock now
          </button>
          {blockReason && <span className="text-xs text-amber-700">{blockReason}</span>}
          {pending && (
            <span className="text-sm text-sky-700" data-testid="rtc-pending">
              {PENDING_TEXT}
            </span>
          )}
          {!pending && last && (
            <span data-testid="rtc-result">
              <CommandStatusPill command={last} />
            </span>
          )}
        </div>
      )}
      {error && (
        <p className="rounded-btn px-3 py-2 text-sm bg-rose-50 text-rose-700" role="alert">
          {error}
        </p>
      )}
    </section>
  );
};
