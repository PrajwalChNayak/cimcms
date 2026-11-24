import { DEVICE_TYPES, type DeviceType } from "@cimcms/contracts";
import type { MqttAccountKind, PrismaClient } from "@prisma/client";
import Argon from "@utils/argon.utils";
import { newMqttPassword } from "@utils/mqttpassword.utils";

export const MQTT_ACCOUNT_USAGE = [
  "Usage: npm run mqtt:account -w apps/api -- <options>",
  "  --username <u> --kind service|legacy|device [--device-id <id> --device-type <TYPE>] [--note \"...\"]",
  "      create or update an account; a new password every time (MQTT_ACCOUNT_PASSWORD, or generated)",
  "  --username <u> --delete     remove an account",
  "  --list                      list accounts (no secrets)",
].join("\n");

const KINDS: Record<string, MqttAccountKind> = { service: "SERVICE", legacy: "LEGACY", device: "DEVICE" };

export type MqttAccountCommand =
  | { action: "list" }
  | { action: "delete"; username: string }
  | {
      action: "upsert";
      username: string;
      kind: MqttAccountKind;
      deviceId: string | null;
      deviceType: DeviceType | null;
      note: string | null;
    };

/** Parses the CLI arguments; throws with a usage message on bad input. */
export function parseMqttAccountArgs(argv: string[]): MqttAccountCommand {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--list" || a === "--delete") {
      flags.add(a);
    } else if (["--username", "--kind", "--device-id", "--device-type", "--note"].includes(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value\n${MQTT_ACCOUNT_USAGE}`);
      values.set(a, v);
      i++;
    } else {
      throw new Error(`Unknown argument: ${a}\n${MQTT_ACCOUNT_USAGE}`);
    }
  }

  if (flags.has("--list")) return { action: "list" };
  const username = values.get("--username")?.trim();
  if (!username) throw new Error(`--username is required\n${MQTT_ACCOUNT_USAGE}`);
  if (flags.has("--delete")) return { action: "delete", username };

  const kindRaw = values.get("--kind")?.toLowerCase();
  const kind = kindRaw ? KINDS[kindRaw] : undefined;
  if (!kind) throw new Error(`--kind must be service, legacy or device\n${MQTT_ACCOUNT_USAGE}`);

  let deviceId: string | null = null;
  let deviceType: DeviceType | null = null;
  if (kind === "DEVICE") {
    deviceId = values.get("--device-id")?.trim() || username;
    if (deviceId !== username) throw new Error("A device account's username must equal its --device-id");
    const t = values.get("--device-type");
    if (!t || !(t in DEVICE_TYPES)) {
      throw new Error(`--device-type is required for a device account: ${Object.keys(DEVICE_TYPES).join(", ")}`);
    }
    deviceType = t as DeviceType;
  } else if (values.has("--device-id") || values.has("--device-type")) {
    throw new Error("--device-id/--device-type are only for --kind device");
  }
  return { action: "upsert", username, kind, deviceId, deviceType, note: values.get("--note") ?? null };
}

/**
 * Creates or updates a broker account with a new password. When `password` is not given a random
 * 32-character one is generated and returned (`generated: true`) so the caller can print it once.
 */
export async function upsertMqttAccount(
  prisma: PrismaClient,
  cmd: Extract<MqttAccountCommand, { action: "upsert" }>,
  password?: string,
): Promise<{ created: boolean; password: string; generated: boolean }> {
  const generated = !password;
  const pw = password || newMqttPassword();
  const passwordHash = await Argon.hashPassword(pw);
  const now = new Date();
  const existing = await prisma.mqttAccount.findUnique({ where: { username: cmd.username } });
  const data = {
    passwordHash,
    kind: cmd.kind,
    deviceId: cmd.deviceId,
    deviceType: cmd.deviceType,
    enabled: true,
    passwordSetAt: now,
    ...(cmd.note !== null && { note: cmd.note }),
  };
  await prisma.mqttAccount.upsert({
    where: { username: cmd.username },
    create: { username: cmd.username, ...data },
    update: data,
  });
  return { created: !existing, password: pw, generated };
}

/** Deletes an account; false when there was none. */
export async function deleteMqttAccount(prisma: PrismaClient, username: string): Promise<boolean> {
  const res = await prisma.mqttAccount.deleteMany({ where: { username } });
  return res.count > 0;
}

export interface MqttAccountRow {
  username: string;
  kind: MqttAccountKind;
  deviceId: string | null;
  deviceType: string | null;
  enabled: boolean;
  note: string | null;
  createdAt: Date;
  passwordSetAt: Date;
}

/** All accounts, without password hashes. */
export function listMqttAccounts(prisma: PrismaClient): Promise<MqttAccountRow[]> {
  return prisma.mqttAccount.findMany({
    orderBy: [{ kind: "asc" }, { username: "asc" }],
    select: {
      username: true,
      kind: true,
      deviceId: true,
      deviceType: true,
      enabled: true,
      note: true,
      createdAt: true,
      passwordSetAt: true,
    },
  });
}
