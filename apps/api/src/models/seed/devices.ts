import type { PrismaClient } from "@prisma/client";
import { DEVICE_TYPES } from "@cimcms/contracts";

export interface SeedDevice {
  deviceId: string;
  type: keyof typeof DEVICE_TYPES;
  name: string;
}

/** Parses `deviceId:TYPE:Name,deviceId:TYPE:Name`. Throws on a bad entry or unknown TYPE. */
export function parseSeedDevices(raw: string | undefined): SeedDevice[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [deviceId, type, ...nameParts] = entry.split(":");
      const name = nameParts.join(":").trim();
      if (!deviceId?.trim() || !type?.trim() || !name) {
        throw new Error(`SEED_DEVICES entry "${entry}" must look like deviceId:TYPE:Name`);
      }
      if (!Object.prototype.hasOwnProperty.call(DEVICE_TYPES, type.trim())) {
        throw new Error(
          `SEED_DEVICES entry "${entry}": unknown TYPE "${type}". Valid: ${Object.keys(DEVICE_TYPES).join(", ")}`,
        );
      }
      return { deviceId: deviceId.trim(), type: type.trim() as SeedDevice["type"], name };
    });
}

/** Upserts by deviceId. Never sets consumerId / farmId. */
export async function seedDevices(prisma: PrismaClient, devices: SeedDevice[]): Promise<number> {
  for (const d of devices) {
    await prisma.device.upsert({
      where: { deviceId: d.deviceId },
      update: { name: d.name, type: d.type, deviceType: d.type },
      create: { deviceId: d.deviceId, name: d.name, type: d.type, deviceType: d.type },
    });
  }
  return devices.length;
}
