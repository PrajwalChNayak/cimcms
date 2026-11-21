import { MVP_COMMAND_ACTIONS, STALE_AFTER_MS } from './constants.js';

export const DEVICE_TYPES = {
  LED_CONTROLLER: {
    topicSegment: 'led',
    channelCount: 16,
    status: 'IMPLEMENTED',
    readOnly: false,
    staleAfterMs: STALE_AFTER_MS,
    handles: ['status', 'telemetry', 'ack', 'event'],
    supportedActions: MVP_COMMAND_ACTIONS,
  },
  HUMIDIFIER: {
    topicSegment: 'humidifier',
    channelCount: null,
    status: 'MONITOR_ONLY',
    readOnly: true,
    staleAfterMs: null, // no known heartbeat -> never marked STALE
    handles: ['status'],
    supportedActions: [],
  },
  STEAM_GENERATOR: {
    topicSegment: 'steam',
    channelCount: null,
    status: 'PLANNED', // TODO(owner-decision O-16)
    readOnly: true,
    staleAfterMs: null,
    handles: [],
    supportedActions: [],
  },
  ENV_CONTROLLER: {
    topicSegment: 'environment',
    channelCount: null,
    status: 'PLANNED', // TODO(owner-decision O-16)
    readOnly: true,
    staleAfterMs: null,
    handles: [],
    supportedActions: [],
  },
} as const;
export type DeviceType = keyof typeof DEVICE_TYPES;

/** Channel count of a device type, or null when the type has no relay channels or is unknown. */
export function getDriverChannelCount(type: string): number | null {
  if (!Object.prototype.hasOwnProperty.call(DEVICE_TYPES, type)) return null;
  return DEVICE_TYPES[type as DeviceType].channelCount;
}
