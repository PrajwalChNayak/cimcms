import type { DeviceListItemDto } from "@cimcms/contracts";
import { LivenessBadge } from "@features/devices/components/LivenessBadge";
import { SimulationBadge } from "@features/devices/components/SimulationBadge";
import { useDevices } from "@features/devices/hooks/useDevices";
import { BulkControlBar } from "@features/ledControl/components/BulkControlBar";
import { RelayGrid } from "@features/ledControl/components/RelayGrid";
import { SimulationBanner } from "@features/ledControl/components/SimulationBanner";
import { useLedController } from "@features/ledControl/hooks/useLedController";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

/** Views only: all logic lives in useLedController. */
const LedControl = ({ device }: { device: DeviceListItemDto }) => {
  const c = useLedController(device.id, device.deviceId);
  const [groupByRoom, setGroupByRoom] = useState(false);

  if (c.isLoading) {
    return (
      <p className="text-sm text-text-secondary" role="status">
        Loading device…
      </p>
    );
  }

  return (
    <>
      {c.simulationMode && <SimulationBanner />}

      <div className="rounded-card bg-surface border border-border shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-text-primary">{device.name}</h1>
          <p className="text-sm text-text-secondary">
            {device.deviceId} · Mode: {c.mode ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LivenessBadge liveness={c.liveness} />
          {c.simulationMode && <SimulationBadge />}
        </div>
      </div>

      {c.blockReason && (
        <div
          className="rounded-btn px-4 py-3 text-sm bg-amber-50 text-amber-800 ring-1 ring-amber-200"
          role="status"
          data-testid="block-reason"
        >
          {c.blockReason}
        </div>
      )}

      {c.submitError && (
        <div className="rounded-btn px-4 py-3 text-sm bg-rose-50 text-rose-700" role="alert">
          {c.submitError}
        </div>
      )}

      {c.hasBulkPermission && (
        <BulkControlBar
          deviceId={device.deviceId}
          canCommand={c.canCommand}
          pending={c.bulkPending}
          last={c.lastBulk}
          onConfirm={(on) => void c.setAll(on)}
        />
      )}

      <label className="flex items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={groupByRoom}
          onChange={(e) => setGroupByRoom(e.target.checked)}
        />
        Group by room
      </label>

      <RelayGrid
        groupByRoom={groupByRoom}
        relays={c.relays}
        simulation={c.simulationMode}
        showControls={c.hasCommandPermission}
        canCommand={c.canCommand}
        bulkPending={c.bulkPending !== null}
        onSet={(relay, on) => void c.setRelay(relay, on)}
      />
    </>
  );
};

export const LedControlPage = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { devices, isLoading } = useDevices();
  const device = devices.find((d) => d.deviceId === deviceId);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <Link to="/devices" className="hover:text-text-primary transition-colors">
          Devices
        </Link>
        <span>/</span>
        <Link
          to={`/devices/${deviceId ?? ""}`}
          className="hover:text-text-primary transition-colors"
        >
          {device?.name ?? deviceId}
        </Link>
        <span>/</span>
        <span className="text-text-primary">Control</span>
      </div>

      {isLoading && (
        <p className="text-sm text-text-secondary" role="status">
          Loading device…
        </p>
      )}
      {!isLoading && !device && (
        <p className="text-sm text-text-secondary">Device not found</p>
      )}
      {device && device.type !== "LED_CONTROLLER" && (
        <p className="text-sm text-text-secondary">
          This device has no relay control page.
        </p>
      )}
      {device && device.type === "LED_CONTROLLER" && <LedControl device={device} />}

      {device && (
        <div className="flex gap-4 text-xs">
          <Link
            to={`/devices/${device.deviceId}/commands`}
            className="text-primary hover:underline"
          >
            Command history
          </Link>
          <Link
            to={`/devices/${device.deviceId}/events`}
            className="text-primary hover:underline"
          >
            Event history
          </Link>
          <Link
            to={`/devices/${device.deviceId}/mode`}
            className="text-primary hover:underline"
          >
            Operating mode
          </Link>
        </div>
      )}
    </div>
  );
};
