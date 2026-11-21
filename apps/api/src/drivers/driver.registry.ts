import {
  backendSubscriptions,
  DEVICE_TYPES,
  type DeviceType,
  type TopicKind,
} from "@cimcms/contracts";

type TypeData = (typeof DEVICE_TYPES)[DeviceType];

export type Driver = TypeData & {
  type: DeviceType;
  /** Topic filters the backend subscribes to for this type (empty if PLANNED). */
  subscriptions: string[];
};

const subscriptionsFor = (type: DeviceType): string[] => {
  const segment = DEVICE_TYPES[type].topicSegment;
  return backendSubscriptions({ monitorHumidifier: true }).filter(
    (t) => t.split("/")[1] === segment,
  );
};

const isDeviceType = (type: string): type is DeviceType =>
  Object.prototype.hasOwnProperty.call(DEVICE_TYPES, type);

/** Returns the driver for a device type. Throws for an unknown type. */
export function getDriver(type: string): Driver {
  if (!isDeviceType(type)) {
    throw new Error(`Unknown device type: ${type}`);
  }
  return { type, ...DEVICE_TYPES[type], subscriptions: subscriptionsFor(type) };
}

export function listDrivers(): Driver[] {
  return (Object.keys(DEVICE_TYPES) as DeviceType[]).map((t) => getDriver(t));
}

export function supportsAction(type: string, action: string): boolean {
  return (getDriver(type).supportedActions as readonly string[]).includes(action);
}

export function handlesKind(type: string, kind: TopicKind): boolean {
  return (getDriver(type).handles as readonly string[]).includes(kind);
}

export function allSubscriptions(opts: { monitorHumidifier: boolean }): string[] {
  return backendSubscriptions(opts);
}
