import { useSelector, useDispatch } from "react-redux";
import {
  selectAllDevices,
  selectDevicesSearch,
  selectDevicesFilterStatus,
  selectDevicesFilterType,
  setDevicesSearch,
  setDevicesFilterStatus,
  setDevicesFilterType,
} from "@store/slices/devicesSlice";
import { selectAllFarms } from "@store/slices/farmsSlice";
import { DeviceCard } from "@shared/components/ui/DeviceCard";
import { SearchInput } from "@shared/components/ui/SearchInput";
import { StatCard } from "@shared/components/ui/StatCard";
import type { Device, DeviceType } from "@appTypes/device.types";
import { deviceTypeLabel } from "@shared/components/ui/DeviceIcon";

const STATUS_FILTERS: Array<Device["status"] | "all"> = ["all", "online", "offline", "error"];

const DEVICE_TYPES: Array<DeviceType | "all"> = [
  "all",
  "wind_sensor",
  "water_temp_sensor",
  "door_lock",
  "water_flow_meter",
  "soil_moisture",
  "weather_station",
  "irrigation_valve",
];

export const DevicesPage = () => {
  const dispatch = useDispatch();
  const allDevices = useSelector(selectAllDevices);
  const farms = useSelector(selectAllFarms);
  const searchQuery = useSelector(selectDevicesSearch);
  const filterStatus = useSelector(selectDevicesFilterStatus);
  const filterType = useSelector(selectDevicesFilterType);

  const filtered = allDevices.filter((d) => {
    const matchSearch =
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      deviceTypeLabel[d.type].toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = filterStatus === "all" || d.status === filterStatus;
    const matchType = filterType === "all" || d.type === filterType;
    return matchSearch && matchStatus && matchType;
  });

  const farmName = (farmId: string) => farms.find((f) => f.id === farmId)?.name;
  const online = allDevices.filter((d) => d.status === "online").length;
  const offline = allDevices.filter((d) => d.status === "offline").length;
  const errors = allDevices.filter((d) => d.status === "error").length;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary">Devices</h1>
        <p className="text-sm text-text-secondary mt-0.5">All IoT devices across your farms</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Devices"
          value={allDevices.length}
          icon="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
          color="primary"
        />
        <StatCard
          label="Online"
          value={online}
          icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          color="emerald"
        />
        <StatCard
          label="Offline"
          value={offline}
          icon="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
          color="sky"
        />
        <StatCard
          label="Errors"
          value={errors}
          icon="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          color="rose"
        />
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={searchQuery}
            onChange={(v) => dispatch(setDevicesSearch(v))}
            placeholder="Search by name or type…"
            className="flex-1 max-w-sm"
          />
          <span className="self-center text-xs text-text-secondary shrink-0">
            {filtered.length} of {allDevices.length}
          </span>
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-secondary">Status:</span>
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => dispatch(setDevicesFilterStatus(s))}
              className={`px-3 py-1 rounded-btn text-xs font-medium capitalize transition-colors cursor-pointer border ${
                filterStatus === s
                  ? "bg-primary text-text-inverted border-primary"
                  : "bg-surface text-text-secondary hover:bg-primary/5 hover:text-text-primary border-border"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Type filter pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-secondary">Type:</span>
          {DEVICE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => dispatch(setDevicesFilterType(t))}
              className={`px-3 py-1 rounded-btn text-xs font-medium capitalize transition-colors cursor-pointer border ${
                filterType === t
                  ? "bg-primary text-text-inverted border-primary"
                  : "bg-surface text-text-secondary hover:bg-primary/5 hover:text-text-primary border-border"
              }`}
            >
              {t === "all" ? "All Types" : deviceTypeLabel[t as DeviceType]}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-card bg-background border border-border flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <p className="text-text-secondary text-sm">No devices match your filters</p>
          <button
            type="button"
            onClick={() => {
              dispatch(setDevicesSearch(""));
              dispatch(setDevicesFilterStatus("all"));
              dispatch(setDevicesFilterType("all"));
            }}
            className="mt-2 text-xs text-primary hover:underline cursor-pointer"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              showFarm
              farmName={farmName(device.farmId)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
