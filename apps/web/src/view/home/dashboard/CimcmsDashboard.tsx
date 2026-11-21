import { DashboardAlerts } from "@features/dashboard/components/DashboardAlerts";
import { DashboardDeviceCard } from "@features/dashboard/components/DashboardDeviceCard";
import { useDashboard } from "@features/dashboard/hooks/useDashboard";
import { EventsCard } from "@features/devices/components/DeviceInfoCards";

/** CIMCMS dashboard (feature flag VITE_FF_CIMCMS=true). Views only: logic is in useDashboard. */
const CimcmsDashboard = () => {
  const { cards, alerts, recentEvents, isLoading, isError, refetch } =
    useDashboard();

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Live status of all CIMCMS devices. Times are shown in IST.
        </p>
      </div>

      {isLoading && (
        <p className="text-sm text-text-secondary" role="status">
          Loading devices…
        </p>
      )}
      {isError && (
        <div className="rounded-btn px-4 py-3 text-sm bg-rose-50 text-rose-700" role="alert">
          Could not load devices.{" "}
          <button type="button" className="underline cursor-pointer" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      )}

      <DashboardAlerts alerts={alerts} />

      {!isLoading && !isError && cards.length === 0 && (
        <p className="text-sm text-text-secondary">No devices found.</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((item) => (
          <DashboardDeviceCard key={item.device.id} item={item} />
        ))}
      </div>

      <EventsCard events={recentEvents} isLoading={false} />
    </div>
  );
};

export default CimcmsDashboard;
