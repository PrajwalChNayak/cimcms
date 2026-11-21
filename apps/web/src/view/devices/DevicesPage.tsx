import { DeviceListCard } from "@features/devices/components/DeviceListCard";
import { useDevices } from "@features/devices/hooks/useDevices";

export const DevicesPage = () => {
  const { devices, isLoading, isError, refetch } = useDevices();

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Devices</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          CIMCMS controllers and monitored equipment. Times are shown in IST.
        </p>
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
    </div>
  );
};
