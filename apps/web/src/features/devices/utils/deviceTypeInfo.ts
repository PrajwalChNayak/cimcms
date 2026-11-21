import { DEVICE_TYPES, type DeviceType } from "@cimcms/contracts";

export const DEVICE_TYPE_LABEL: Record<DeviceType, string> = {
  LED_CONTROLLER: "LED Controller",
  HUMIDIFIER: "Humidifier",
  STEAM_GENERATOR: "Steam Generator",
  ENV_CONTROLLER: "Environment Controller",
};

export const isPlannedType = (type: DeviceType): boolean =>
  DEVICE_TYPES[type].status === "PLANNED";

/** `x / 16` for devices with relay channels and a known snapshot, otherwise an em dash. */
export const relayCountText = (
  type: DeviceType,
  relayStates: boolean[] | undefined,
  relayOnCount: number | undefined,
): string => {
  const channels = DEVICE_TYPES[type].channelCount;
  if (channels === null || !relayStates || relayStates.length === 0) return "—";
  return `${relayOnCount ?? relayStates.filter(Boolean).length} / ${channels}`;
};
