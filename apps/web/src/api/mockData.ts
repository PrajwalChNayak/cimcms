import type { User } from "@appTypes/auth.types";
import type { Device, ReadingPoint } from "@appTypes/device.types";
import type { Farm, FarmSummary } from "@appTypes/farm.types";

// ─── Users ────────────────────────────────────────────────
export const mockUser: User = {
  id: "u-001",
  email: "admin@cultivoiot.com",
  name: "Carlos Rivera",
  roles: ["ADMIN"],
  permissions: [],
};

// ─── Farms ────────────────────────────────────────────────
export const mockFarms: Farm[] = [
  {
    id: "farm-001",
    name: "Mahanadi Krushi Kshetra",
    location: "Cuttack, Odisha",
    // description: "Primary paddy and pulse cultivation farm",
    ownerId: "u-001",
    area: "120 ha",
    createdAt: "2023-01-15T08:00:00Z",
    updatedAt: "2026-05-09T10:00:00Z",
  },
  {
    id: "farm-002",
    name: "Satabdi Tarkari Bagicha",
    location: "Jagatsinghpur, Odisha",
    // description: "Vegetable and chili cultivation operations",
    ownerId: "u-001",
    area: "45 ha",
    createdAt: "2023-06-20T08:00:00Z",
    updatedAt: "2026-05-09T10:00:00Z",
  },
  {
    id: "farm-003",
    name: "Prabhati Phala Bagicha",
    location: "Cuttack, Odisha",
    // description: "Mango orchard and coconut grove management",
    ownerId: "u-001",
    area: "80 ha",
    createdAt: "2024-02-10T08:00:00Z",
    updatedAt: "2026-05-09T10:00:00Z",
  },
  {
    id: "farm-004",
    name: "Chilika Jalakrushi Kheta",
    location: "Jagatsinghpur, Odisha",
    // description: "Aquaculture and coastal prawn cultivation",
    ownerId: "u-001",
    area: "30 ha",
    createdAt: "2024-08-01T08:00:00Z",
    updatedAt: "2026-05-09T10:00:00Z",
  },
];

// ─── Devices ──────────────────────────────────────────────
export const mockDevices: Device[] = [
  // Farm 001 devices
  {
    id: "dev-001",
    name: "Wind Sensor WS-01",
    type: "wind_sensor",
    farmId: "farm-001",
    status: "online",
    lastReading: {
      value: 12.4,
      unit: "km/h",
      timestamp: "2026-05-09T10:42:00Z",
    },
    lastSeen: "2026-05-09T10:42:00Z",
    batteryLevel: 87,
    signalStrength: "strong",
    firmwareVersion: "2.1.3",
    createdAt: "2023-03-01T08:00:00Z",
    updatedAt: "2026-05-09T10:42:00Z",
  },
  {
    id: "dev-002",
    name: "Water Temp WT-01",
    type: "water_temp_sensor",
    farmId: "farm-001",
    status: "online",
    lastReading: { value: 22.7, unit: "°C", timestamp: "2026-05-09T10:41:00Z" },
    lastSeen: "2026-05-09T10:41:00Z",
    batteryLevel: 94,
    signalStrength: "strong",
    firmwareVersion: "1.8.0",
    createdAt: "2023-03-01T08:00:00Z",
    updatedAt: "2026-05-09T10:41:00Z",
  },
  {
    id: "dev-003",
    name: "Door Lock DL-01",
    type: "door_lock",
    farmId: "farm-001",
    status: "online",
    lastReading: { value: "Locked", timestamp: "2026-05-09T10:00:00Z" },
    lastSeen: "2026-05-09T10:00:00Z",
    batteryLevel: 76,
    signalStrength: "good",
    firmwareVersion: "3.0.1",
    isLocked: true,
    createdAt: "2023-04-15T08:00:00Z",
    updatedAt: "2026-05-09T10:00:00Z",
  },
  {
    id: "dev-004",
    name: "Flow Meter FM-01",
    type: "water_flow_meter",
    farmId: "farm-001",
    status: "error",
    lastReading: { value: 0, unit: "L/min", timestamp: "2026-05-09T09:15:00Z" },
    lastSeen: "2026-05-09T09:15:00Z",
    batteryLevel: 22,
    signalStrength: "weak",
    firmwareVersion: "1.2.4",
    createdAt: "2023-04-15T08:00:00Z",
    updatedAt: "2026-05-09T09:15:00Z",
  },
  {
    id: "dev-005",
    name: "Moisture SM-01",
    type: "moisture",
    farmId: "farm-001",
    status: "online",
    lastReading: { value: 68, unit: "%", timestamp: "2026-05-09T10:40:00Z" },
    lastSeen: "2026-05-09T10:40:00Z",
    batteryLevel: 91,
    signalStrength: "strong",
    firmwareVersion: "2.0.1",
    createdAt: "2023-05-01T08:00:00Z",
    updatedAt: "2026-05-09T10:40:00Z",
  },
  // Farm 002 devices
  {
    id: "dev-006",
    name: "Wind Sensor WS-02",
    type: "wind_sensor",
    farmId: "farm-002",
    status: "online",
    lastReading: {
      value: 8.1,
      unit: "km/h",
      timestamp: "2026-05-09T10:43:00Z",
    },
    lastSeen: "2026-05-09T10:43:00Z",
    batteryLevel: 60,
    signalStrength: "good",
    firmwareVersion: "2.1.3",
    createdAt: "2023-07-01T08:00:00Z",
    updatedAt: "2026-05-09T10:43:00Z",
  },
  {
    id: "dev-007",
    name: "Water Temp WT-02",
    type: "water_temp_sensor",
    farmId: "farm-002",
    status: "offline",
    lastReading: { value: 19.3, unit: "°C", timestamp: "2026-05-08T18:00:00Z" },
    lastSeen: "2026-05-08T18:00:00Z",
    batteryLevel: 8,
    signalStrength: "none",
    firmwareVersion: "1.8.0",
    createdAt: "2023-07-01T08:00:00Z",
    updatedAt: "2026-05-08T18:00:00Z",
  },
  {
    id: "dev-008",
    name: "Flow Meter FM-02",
    type: "water_flow_meter",
    farmId: "farm-002",
    status: "online",
    lastReading: {
      value: 34.5,
      unit: "L/min",
      timestamp: "2026-05-09T10:44:00Z",
    },
    lastSeen: "2026-05-09T10:44:00Z",
    batteryLevel: 83,
    signalStrength: "strong",
    firmwareVersion: "1.2.5",
    createdAt: "2023-07-10T08:00:00Z",
    updatedAt: "2026-05-09T10:44:00Z",
  },
  {
    id: "dev-009",
    name: "Door Lock DL-02",
    type: "door_lock",
    farmId: "farm-002",
    status: "online",
    lastReading: { value: "Unlocked", timestamp: "2026-05-09T08:30:00Z" },
    lastSeen: "2026-05-09T08:30:00Z",
    batteryLevel: 55,
    signalStrength: "good",
    firmwareVersion: "3.0.1",
    isLocked: false,
    createdAt: "2023-08-01T08:00:00Z",
    updatedAt: "2026-05-09T08:30:00Z",
  },
  // Farm 003 devices
  {
    id: "dev-010",
    name: "Weather Station WX-01",
    type: "weather_station",
    farmId: "farm-003",
    status: "online",
    lastReading: { value: 25.2, unit: "°C", timestamp: "2026-05-09T10:45:00Z" },
    lastSeen: "2026-05-09T10:45:00Z",
    batteryLevel: 100,
    signalStrength: "strong",
    firmwareVersion: "4.1.0",
    createdAt: "2024-03-01T08:00:00Z",
    updatedAt: "2026-05-09T10:45:00Z",
  },
  {
    id: "dev-011",
    name: "Moisture SM-02",
    type: "moisture",
    farmId: "farm-003",
    status: "online",
    lastReading: { value: 52, unit: "%", timestamp: "2026-05-09T10:42:00Z" },
    lastSeen: "2026-05-09T10:42:00Z",
    batteryLevel: 78,
    signalStrength: "good",
    firmwareVersion: "2.0.1",
    createdAt: "2024-03-01T08:00:00Z",
    updatedAt: "2026-05-09T10:42:00Z",
  },
  {
    id: "dev-012",
    name: "Pump IV-01",
    type: "irrigation_valve",
    farmId: "farm-003",
    status: "error",
    lastReading: { value: "Closed", timestamp: "2026-05-09T07:00:00Z" },
    lastSeen: "2026-05-09T07:00:00Z",
    batteryLevel: 15,
    signalStrength: "weak",
    firmwareVersion: "1.5.2",
    createdAt: "2024-04-01T08:00:00Z",
    updatedAt: "2026-05-09T07:00:00Z",
  },
  // Farm 004 devices
  {
    id: "dev-013",
    name: "Water Temp WT-03",
    type: "water_temp_sensor",
    farmId: "farm-004",
    status: "online",
    lastReading: { value: 28.9, unit: "°C", timestamp: "2026-05-09T10:46:00Z" },
    lastSeen: "2026-05-09T10:46:00Z",
    batteryLevel: 88,
    signalStrength: "strong",
    firmwareVersion: "1.9.2",
    createdAt: "2024-09-01T08:00:00Z",
    updatedAt: "2026-05-09T10:46:00Z",
  },
  {
    id: "dev-014",
    name: "Flow Meter FM-03",
    type: "water_flow_meter",
    farmId: "farm-004",
    status: "online",
    lastReading: {
      value: 18.3,
      unit: "L/min",
      timestamp: "2026-05-09T10:44:00Z",
    },
    lastSeen: "2026-05-09T10:44:00Z",
    batteryLevel: 72,
    signalStrength: "good",
    firmwareVersion: "1.3.0",
    createdAt: "2024-09-01T08:00:00Z",
    updatedAt: "2026-05-09T10:44:00Z",
  },
];

// ─── Computed Summaries ────────────────────────────────────
export const mockFarmSummaries: FarmSummary[] = mockFarms.map((farm) => {
  const farmDevices = mockDevices.filter((d) => d.farmId === farm.id);
  return {
    ...farm,
    totalDevices: farmDevices.length,
    onlineDevices: farmDevices.filter((d) => d.status === "online").length,
    offlineDevices: farmDevices.filter((d) => d.status === "offline").length,
    alertCount: farmDevices.filter((d) => d.status === "error").length,
  };
});

// ─── Historical Data Generator ────────────────────────────
const generateHistory = (
  base: number,
  points = 24,
  variance = 3,
): ReadingPoint[] => {
  const now = Date.now();
  return Array.from({ length: points }, (_, i) => ({
    timestamp: new Date(now - (points - 1 - i) * 3600_000).toISOString(),
    value: parseFloat((base + (Math.random() - 0.5) * variance * 2).toFixed(1)),
  }));
};

export const mockHistoricalData: Record<string, ReadingPoint[]> = {
  "dev-001": generateHistory(12, 24, 4), // wind speed
  "dev-002": generateHistory(22, 24, 2), // water temp
  "dev-004": generateHistory(30, 24, 10), // flow meter
  "dev-005": generateHistory(68, 24, 5), // Moisture
  "dev-006": generateHistory(8, 24, 3), // wind speed
  "dev-008": generateHistory(34, 24, 8), // flow meter
  "dev-010": generateHistory(25, 24, 3), // weather station temp
  "dev-011": generateHistory(52, 24, 6), // Moisture
  "dev-013": generateHistory(29, 24, 2), // water temp
  "dev-014": generateHistory(18, 24, 4), // flow meter
};

// ─── Notifications ────────────────────────────────────────
export interface Notification {
  id: string;
  deviceId: string;
  farmId: string;
  title: string;
  message: string;
  severity: "critical" | "warning" | "info";
  read: boolean;
  timestamp: string;
}

export const mockNotifications: Notification[] = [
  {
    id: "notif-001",
    deviceId: "dev-004",
    farmId: "farm-001",
    title: "Device Error",
    message: "Flow Meter FM-01 is reporting errors. Check sensor connection.",
    severity: "critical",
    read: false,
    timestamp: "2026-05-09T09:15:00Z",
  },
  {
    id: "notif-002",
    deviceId: "dev-007",
    farmId: "farm-002",
    title: "Device Offline",
    message: "Water Temp WT-02 has gone offline. Battery at 8%.",
    severity: "critical",
    read: false,
    timestamp: "2026-05-08T18:00:00Z",
  },
  {
    id: "notif-003",
    deviceId: "dev-012",
    farmId: "farm-003",
    title: "Device Error",
    message: "Pump IV-01 is reporting errors. Battery critically low.",
    severity: "warning",
    read: false,
    timestamp: "2026-05-09T07:00:00Z",
  },
  {
    id: "notif-004",
    deviceId: "dev-001",
    farmId: "farm-001",
    title: "High Wind Speed",
    message:
      "Wind Sensor WS-01 detected wind speed above threshold (12+ km/h).",
    severity: "warning",
    read: true,
    timestamp: "2026-05-09T10:42:00Z",
  },
  {
    id: "notif-005",
    deviceId: "dev-013",
    farmId: "farm-004",
    title: "High Water Temperature",
    message: "Water Temp WT-03 reading 28.9°C — above normal range.",
    severity: "info",
    read: true,
    timestamp: "2026-05-09T10:46:00Z",
  },
];
