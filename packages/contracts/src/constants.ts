export const SCHEMA_VERSION = 1 as const;
export const TOPIC_ROOT = 'cimcms' as const;
export const LED_CHANNEL_COUNT = 16 as const;
export const TIMEZONE = 'Asia/Kolkata' as const;
export const TZ_OFFSET_MINUTES = 330 as const;

export const COMMAND_TTL_MS = 15_000; // expires_at = issued_at + TTL
export const COMMAND_TIMEOUT_GRACE_MS = 5_000; // backend TIMEOUT at expires_at + grace
export const MAX_INFLIGHT_COMMANDS_PER_DEVICE = 4;
export const HEARTBEAT_INTERVAL_S = 30; // device telemetry period
export const MQTT_KEEPALIVE_S = 30;
export const STALE_AFTER_MS = 75_000; // 2.5 x heartbeat
export const MAX_MQTT_PAYLOAD_BYTES = 16_384; // backend drops larger messages
export const MAX_CONFIG_PAYLOAD_BYTES = 4_096; // firmware MQTT buffer must be >= this

export const DEVICE_MODES = ['MANUAL', 'MAINTENANCE', 'AUTO', 'EXPERIMENT'] as const;
export const ON_OFF = ['ON', 'OFF'] as const;
export const LIVENESS = ['UNKNOWN', 'ONLINE', 'STALE', 'OFFLINE'] as const;

export const COMMAND_ACTIONS = [
  'SET_RELAY',
  'SET_ALL_RELAYS',
  'REQUEST_STATUS',
  'SET_MODE',
  'RTC_SYNC_NOW',
] as const;
// Actions the LED controller supports. Phase 5 added SET_MODE (T5.2) and RTC_SYNC_NOW (T5.5).
// RTC_SYNC_NOW is not part of submitCommandBodySchema: it has its own route (DEVICE_DIAGNOSTICS).
export const MVP_COMMAND_ACTIONS = [
  'SET_RELAY',
  'SET_ALL_RELAYS',
  'REQUEST_STATUS',
  'SET_MODE',
  'RTC_SYNC_NOW',
] as const;

export const ACK_RESULTS = [
  'ACCEPTED',
  'EXECUTED',
  'REJECTED',
  'EXPIRED',
  'DUPLICATE',
  'FAILED',
] as const;

// Backend-side command status (superset of device results)
export const COMMAND_STATUSES = [
  'PENDING',
  'PUBLISHED',
  'ACCEPTED',
  'EXECUTED',
  'REJECTED',
  'EXPIRED',
  'DUPLICATE',
  'FAILED',
  'TIMEOUT',
  'PUBLISH_FAILED',
] as const;
export const NON_TERMINAL_COMMAND_STATUSES = ['PENDING', 'PUBLISHED', 'ACCEPTED'] as const;

export const COMMAND_SOURCES = ['web', 'schedule', 'experiment', 'system'] as const;

export const DEVICE_EVENT_TYPES = [
  'BOOT',
  'RELAY_CHANGED',
  'MODE_CHANGED',
  'KEYPAD',
  'WIFI',
  'MQTT',
  'RTC_SYNC',
  'CONFIG_APPLIED',
  'ERROR',
] as const;
// Events the backend itself records (origin BACKEND)
export const BACKEND_EVENT_TYPES = [
  'ONLINE',
  'OFFLINE',
  'STALE',
  'SCHEMA_REJECTED',
  'UNKNOWN_ACK',
] as const;

export const RELAY_CHANGE_SOURCES = [
  'KEYPAD',
  'COMMAND',
  'SCHEDULE',
  'EXPERIMENT',
  'BOOT',
  'UNKNOWN',
] as const;

export type Mode = (typeof DEVICE_MODES)[number];
export type OnOff = (typeof ON_OFF)[number];
export type Liveness = (typeof LIVENESS)[number];
export type CommandAction = (typeof COMMAND_ACTIONS)[number];
export type AckResult = (typeof ACK_RESULTS)[number];
export type CommandStatus = (typeof COMMAND_STATUSES)[number];
export type CommandSource = (typeof COMMAND_SOURCES)[number];
export type DeviceEventType = (typeof DEVICE_EVENT_TYPES)[number];
export type RelayChangeSource = (typeof RELAY_CHANGE_SOURCES)[number];
