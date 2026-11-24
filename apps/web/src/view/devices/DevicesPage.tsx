import type { RegisterDeviceResultDto } from "@cimcms/contracts";
import { useRegisterDeviceMutation } from "@api/deviceApi";
import { AddDeviceModal } from "@features/devices/components/DeviceFormModal";
import { DeviceListCard } from "@features/devices/components/DeviceListCard";
import { useDevices } from "@features/devices/hooks/useDevices";
import { usePermission } from "@shared/hooks/usePermission";
import { extractErrorMessage } from "@shared/utils/errorUtils";
import { useState } from "react";

export const DevicesPage = () => {
  const { devices, isLoading, isError, refetch } = useDevices();
  const canManage = usePermission("DEVICE_MANAGE");
  const [register, { isLoading: saving, reset: resetRegister }] = useRegisterDeviceMutation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Holds the one-time broker password while the dialog is open; cleared on close.
  const [registered, setRegistered] = useState<RegisterDeviceResultDto | null>(null);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Devices</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            CIMCMS controllers and monitored equipment. Times are shown in IST.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setRegistered(null);
              setOpen(true);
            }}
            className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-text-inverted cursor-pointer"
          >
            Add device
          </button>
        )}
      </div>

      {isLoading && (
        <p className="text-sm text-text-secondary" role="status">
          Loading devices…
        </p>
      )}

      {isError && (
        <div
          className="rounded-btn px-4 py-3 text-sm bg-rose-50 text-rose-700"
          role="alert"
        >
          Could not load devices.{" "}
          <button type="button" className="underline cursor-pointer" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && devices.length === 0 && (
        <p className="text-sm text-text-secondary">No devices found.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {devices.map((device) => (
          <DeviceListCard key={device.id} device={device} />
        ))}
      </div>

      <AddDeviceModal
        isOpen={open}
        error={error}
        busy={saving}
        registered={registered}
        onClose={() => {
          setOpen(false);
          setRegistered(null);
          resetRegister(); // drop the result (and its password) from the store
        }}
        onSubmit={(body) => {
          setError(null);
          register(body)
            .unwrap()
            .then(setRegistered)
            .catch((e: unknown) => setError(extractErrorMessage(e, "Could not add the device")));
        }}
      />
    </div>
  );
};
