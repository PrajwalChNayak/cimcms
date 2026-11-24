import { DEVICE_TYPES, type DeviceType } from "@cimcms/contracts";

/** What a logged-in client is, as far as topic permissions go. */
export type AccountKind = "DEVICE" | "SERVICE" | "LEGACY";

export interface AclAccount {
  username: string;
  kind: AccountKind;
  deviceId: string | null;
  deviceType: string | null;
}

/** Only the CIMCMS API may publish here: tells the broker to drop sessions of a changed login. */
export const ACCOUNT_CHANGED_TOPIC = "cimcms/broker/account-changed";

/** Topics the API (SERVICE) may publish to. */
const SERVICE_PUBLISH = [
  "cimcms/+/+/command",
  "cimcms/+/+/config",
  "cimcms/backend/status",
  ACCOUNT_CHANGED_TOPIC,
];

/** Topic filters the API may subscribe to (or anything narrower). */
const SERVICE_SUBSCRIBE = [
  "cimcms/+/+/status",
  "cimcms/+/+/telemetry",
  "cimcms/+/+/ack",
  "cimcms/+/+/event",
  "cimcms/backend/status",
];

const DEVICE_PUBLISH_KINDS = ["status", "telemetry", "ack", "event"];
const DEVICE_SUBSCRIBE_KINDS = ["command", "config"];

/** True when an MQTT topic (no wildcards) matches a filter with + and #. */
export function topicMatches(filter: string, topic: string): boolean {
  const f = filter.split("/");
  const t = topic.split("/");
  for (let i = 0; i < f.length; i++) {
    if (f[i] === "#") return true;
    if (i >= t.length) return false;
    if (f[i] !== "+" && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}

/**
 * True when every topic matched by `requested` is also matched by `allowed`
 * (a subscription may be the same as an allowed filter or narrower, never wider).
 */
export function filterCovers(allowed: string, requested: string): boolean {
  const a = allowed.split("/");
  const r = requested.split("/");
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "#") return true;
    if (i >= r.length) return false;
    if (r[i] === "#") return false; // requested is wider than this level
    if (a[i] === "+") continue;
    if (r[i] === "+" || a[i] !== r[i]) return false;
  }
  return a.length === r.length;
}

/** Own topic base of a device account, e.g. cimcms/led/LED-02. Null when the account is broken. */
export function deviceBase(account: AclAccount): string | null {
  if (!account.deviceId || !account.deviceType) return null;
  // Own keys only: "constructor", "toString" etc. must not count as device types.
  if (!Object.hasOwn(DEVICE_TYPES, account.deviceType)) return null;
  const type = DEVICE_TYPES[account.deviceType as DeviceType];
  if (!type?.topicSegment) return null;
  return `cimcms/${type.topicSegment}/${account.deviceId}`;
}

const isSystemTopic = (topic: string): boolean => topic.startsWith("$");

export function canPublish(account: AclAccount, topic: string): boolean {
  if (isSystemTopic(topic)) return false;
  switch (account.kind) {
    case "LEGACY":
      return topic !== ACCOUNT_CHANGED_TOPIC;
    case "SERVICE":
      return SERVICE_PUBLISH.some((f) => topicMatches(f, topic));
    case "DEVICE": {
      const base = deviceBase(account);
      return !!base && DEVICE_PUBLISH_KINDS.some((k) => topic === `${base}/${k}`);
    }
    default:
      return false;
  }
}

export function canSubscribe(account: AclAccount, filter: string): boolean {
  if (isSystemTopic(filter)) return false;
  switch (account.kind) {
    case "LEGACY":
      return true;
    case "SERVICE":
      return SERVICE_SUBSCRIBE.some((a) => filterCovers(a, filter));
    case "DEVICE": {
      const base = deviceBase(account);
      return !!base && DEVICE_SUBSCRIBE_KINDS.some((k) => filter === `${base}/${k}`);
    }
    default:
      return false;
  }
}
