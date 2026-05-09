import type { PaginationParams } from "@appTypes/api.types";

// Supported device types
export type DeviceType =
  | "wind_sensor"
  | "water_temp_sensor"
  | "door_lock"
  | "water_flow_meter"
  | "soil_moisture"
  | "weather_station"
  | "irrigation_valve"
  | "unknown";

// Current reading value
export interface DeviceReading {
  value: number | string | boolean;
  unit?: string;
  timestamp: string;
}

// Historical reading point for charts
export interface ReadingPoint {
  timestamp: string; // ISO string
  value: number;
}

// Domain model
export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  farmId: string;
  status: "online" | "offline" | "error";
  lastReading?: DeviceReading;
  lastSeen?: string;
  firmwareVersion?: string;
  batteryLevel?: number; // 0-100
  signalStrength?: "strong" | "good" | "weak" | "none";
  // Door lock specific
  isLocked?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Request DTOs
export interface CreateDeviceRequest {
  name: string;
  type: DeviceType;
  farmId: string;
}

export interface UpdateDeviceRequest {
  name?: string;
  type?: DeviceType;
  status?: Device["status"];
}

export interface GetDevicesParams extends PaginationParams {
  farmId?: string;
  type?: DeviceType;
  status?: Device["status"];
}

// Form state
export interface DeviceFormState {
  name: string;
  type: string;
  farmId: string;
}

export interface DeviceFormErrors {
  name?: string;
  type?: string;
  farmId?: string;
}
