import type { DeviceType } from "@appTypes/device.types";

interface DeviceIconProps {
  type: DeviceType;
  className?: string;
}

const iconPaths: Record<DeviceType, string> = {
  wind_sensor:
    "M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1014 16H2m15.73-8.27A2.5 2.5 0 1119.5 12H2",
  water_temp_sensor:
    "M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z",
  door_lock:
    "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  water_flow_meter:
    "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  soil_moisture:
    "M12 21a8 8 0 01-8-8c0-4.42 8-12 8-12s8 7.58 8 12a8 8 0 01-8 8z",
  weather_station:
    "M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z",
  irrigation_valve:
    "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
  unknown:
    "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};

const colorMap: Record<DeviceType, string> = {
  wind_sensor: "text-sky-400",
  water_temp_sensor: "text-blue-400",
  door_lock: "text-violet-400",
  water_flow_meter: "text-cyan-400",
  soil_moisture: "text-emerald-400",
  weather_station: "text-amber-400",
  irrigation_valve: "text-teal-400",
  unknown: "text-slate-400",
};

export const DeviceIcon = ({ type, className = "w-5 h-5" }: DeviceIconProps) => (
  <svg
    className={`${className} ${colorMap[type] ?? colorMap.unknown}`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.75}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d={iconPaths[type] ?? iconPaths.unknown} />
  </svg>
);

export const deviceTypeLabel: Record<DeviceType, string> = {
  wind_sensor: "Wind Sensor",
  water_temp_sensor: "Water Temperature",
  door_lock: "Door Lock",
  water_flow_meter: "Water Flow Meter",
  soil_moisture: "Soil Moisture",
  weather_station: "Weather Station",
  irrigation_valve: "Irrigation Valve",
  unknown: "Unknown Device",
};

export const deviceTypeBg: Record<DeviceType, string> = {
  wind_sensor: "bg-sky-500/10",
  water_temp_sensor: "bg-blue-500/10",
  door_lock: "bg-violet-500/10",
  water_flow_meter: "bg-cyan-500/10",
  soil_moisture: "bg-emerald-500/10",
  weather_station: "bg-amber-500/10",
  irrigation_valve: "bg-teal-500/10",
  unknown: "bg-slate-500/10",
};
