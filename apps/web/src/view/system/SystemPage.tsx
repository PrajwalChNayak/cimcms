import { useDevices } from "@features/devices/hooks/useDevices";
import { useGetSystemStatusQuery } from "@features/system/api/systemApi";
import { DeviceDiagnosticsCard } from "@features/system/components/DeviceDiagnosticsCard";
import { usePermission } from "@shared/hooks/usePermission";

const Up = ({ ok }: { ok: boolean }) => (
  <span className={ok ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold"}>
    {ok ? "Connected" : "Not connected"}
  </span>
);

/** Backend connections (admin only) and per-device clock / Wi-Fi diagnostics. */
const BackendCard = () => {
  const { data, isError, isLoading } = useGetSystemStatusQuery();
  return (
    <section className="rounded-card border border-border bg-surface p-4 text-sm" data-testid="backend-status">
      <h2 className="text-base font-semibold text-text-primary mb-2">Backend connections</h2>
      {isLoading && <p className="text-text-secondary" role="status">Checking…</p>}
      {isError && <p className="text-rose-700">Could not read the backend status.</p>}
      {data && (
        <ul className="space-y-1">
          <li>
            MQTT broker: <Up ok={data.mqtt === "up"} />
          </li>
          <li>
            Database: <Up ok={data.database === "up"} />
          </li>
        </ul>
      )}
    </section>
  );
};

export const SystemPage = () => {
  const isAdmin = usePermission("DEVICE_MANAGE");
  const { devices, isLoading } = useDevices();
  const leds = devices.filter((d) => d.type === "LED_CONTROLLER");

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-text-primary">System</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Backend connections and device clock diagnostics. Times are shown in IST.
        </p>
      </div>
      {isAdmin && <BackendCard />}
      {isLoading && <p className="text-sm text-text-secondary" role="status">Loading devices…</p>}
      {!isLoading && leds.length === 0 && (
        <p className="text-sm text-text-secondary">No controllers found.</p>
      )}
      {leds.map((d) => (
        <DeviceDiagnosticsCard key={d.id} device={d} />
      ))}
    </div>
  );
};
