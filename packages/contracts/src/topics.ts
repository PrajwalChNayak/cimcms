import { TOPIC_ROOT } from './constants.js';
import { DEVICE_TYPES, type DeviceType } from './deviceTypes.js';

export type TopicKind = 'status' | 'telemetry' | 'ack' | 'event' | 'command' | 'config';
const KINDS: readonly string[] = ['status', 'telemetry', 'ack', 'event', 'command', 'config'];
const DEVICE_ID_RE = /^[A-Za-z0-9-]{3,40}$/;

export const BACKEND_STATUS_TOPIC = `${TOPIC_ROOT}/backend/status`;
/** API -> broker: `{"username":"<u>"}` after a broker account changed; the broker drops its live sessions. */
export const BROKER_ACCOUNT_CHANGED_TOPIC = `${TOPIC_ROOT}/broker/account-changed`;

export function topicFor(type: DeviceType, deviceId: string, kind: TopicKind): string {
  return `${TOPIC_ROOT}/${DEVICE_TYPES[type].topicSegment}/${deviceId}/${kind}`;
}

export function parseTopic(
  topic: string,
): { type: DeviceType; deviceId: string; kind: TopicKind } | null {
  const parts = topic.split('/');
  if (parts.length !== 4 || parts[0] !== TOPIC_ROOT) return null;
  const [, segment, deviceId, kind] = parts as [string, string, string, string];
  if (!DEVICE_ID_RE.test(deviceId) || !KINDS.includes(kind)) return null;
  const type = (Object.keys(DEVICE_TYPES) as DeviceType[]).find(
    (t) => DEVICE_TYPES[t].topicSegment === segment,
  );
  if (!type) return null;
  return { type, deviceId, kind: kind as TopicKind };
}

export function backendSubscriptions(opts: { monitorHumidifier: boolean }): string[] {
  const led = DEVICE_TYPES.LED_CONTROLLER.topicSegment;
  const subs = (['status', 'telemetry', 'ack', 'event'] as const).map(
    (k) => `${TOPIC_ROOT}/${led}/+/${k}`,
  );
  if (opts.monitorHumidifier) {
    subs.push(`${TOPIC_ROOT}/${DEVICE_TYPES.HUMIDIFIER.topicSegment}/+/status`);
  }
  return subs;
}
