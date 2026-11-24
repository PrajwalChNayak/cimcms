import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "@models/prisma.client";
import {
  deleteMqttAccount,
  listMqttAccounts,
  parseMqttAccountArgs,
  upsertMqttAccount,
  type MqttAccountCommand,
} from "@models/seed/mqttAccount";
import Argon from "@utils/argon.utils";

/** `npm run mqtt:account`: the module functions behind the CLI. */
const NAMES = ["cli-svc", "cli-legacy", "LED-CLI-1"];

type Upsert = Extract<MqttAccountCommand, { action: "upsert" }>;
const upsertCmd = (argv: string[]): Upsert => {
  const cmd = parseMqttAccountArgs(argv);
  if (cmd.action !== "upsert") throw new Error(`expected upsert, got ${cmd.action}`);
  return cmd;
};

const cleanup = () => prisma.mqttAccount.deleteMany({ where: { username: { in: NAMES } } });

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("parseMqttAccountArgs", () => {
  it("parses service, device, delete and list", () => {
    expect(parseMqttAccountArgs(["--username", "svc", "--kind", "service", "--note", "API"])).toEqual({
      action: "upsert",
      username: "svc",
      kind: "SERVICE",
      deviceId: null,
      deviceType: null,
      note: "API",
    });
    expect(
      parseMqttAccountArgs(["--username", "LED-1", "--kind", "device", "--device-type", "LED_CONTROLLER"]),
    ).toMatchObject({ kind: "DEVICE", deviceId: "LED-1", deviceType: "LED_CONTROLLER" });
    expect(parseMqttAccountArgs(["--username", "svc", "--delete"])).toEqual({ action: "delete", username: "svc" });
    expect(parseMqttAccountArgs(["--list"])).toEqual({ action: "list" });
  });

  it("rejects bad input", () => {
    expect(() => parseMqttAccountArgs([])).toThrow(/--username/);
    expect(() => parseMqttAccountArgs(["--username", "x", "--kind", "root"])).toThrow(/--kind/);
    expect(() => parseMqttAccountArgs(["--username", "x", "--kind", "device"])).toThrow(/--device-type/);
    expect(() =>
      parseMqttAccountArgs(["--username", "x", "--kind", "device", "--device-id", "y", "--device-type", "LED_CONTROLLER"]),
    ).toThrow(/must equal/);
    expect(() =>
      parseMqttAccountArgs(["--username", "x", "--kind", "service", "--device-type", "LED_CONTROLLER"]),
    ).toThrow(/only for --kind device/);
    expect(() => parseMqttAccountArgs(["--username", "x", "--bogus"])).toThrow(/Unknown argument/);
  });
});

describe("upsert / delete / list", () => {
  it("creates with a generated password, and re-running sets a new one", async () => {
    const cmd = upsertCmd(["--username", "cli-svc", "--kind", "service", "--note", "backend"]);
    const first = await upsertMqttAccount(prisma, cmd);
    expect(first).toMatchObject({ created: true, generated: true });
    expect(first.password).toMatch(/^[A-Za-z0-9]{32}$/);
    const row1 = (await prisma.mqttAccount.findUniqueOrThrow({ where: { username: "cli-svc" } }))!;
    expect(row1).toMatchObject({ kind: "SERVICE", note: "backend", enabled: true, deviceId: null });
    expect(await Argon.verifyPassword(first.password, row1.passwordHash)).toBe(true);

    const second = await upsertMqttAccount(prisma, cmd);
    expect(second.created).toBe(false);
    expect(second.password).not.toBe(first.password);
    const row2 = await prisma.mqttAccount.findUniqueOrThrow({ where: { username: "cli-svc" } });
    expect(row2.id).toBe(row1.id);
    expect(await Argon.verifyPassword(first.password, row2.passwordHash)).toBe(false);
    expect(await Argon.verifyPassword(second.password, row2.passwordHash)).toBe(true);
  });

  it("uses a given password (MQTT_ACCOUNT_PASSWORD) and stores device fields", async () => {
    const legacy = await upsertMqttAccount(prisma, upsertCmd(["--username", "cli-legacy", "--kind", "legacy"]), "keep-me");
    expect(legacy).toMatchObject({ generated: false, password: "keep-me" });
    const l = await prisma.mqttAccount.findUniqueOrThrow({ where: { username: "cli-legacy" } });
    expect(await Argon.verifyPassword("keep-me", l.passwordHash)).toBe(true);

    await upsertMqttAccount(
      prisma,
      upsertCmd(["--username", "LED-CLI-1", "--kind", "device", "--device-type", "LED_CONTROLLER"]),
    );
    expect(await prisma.mqttAccount.findUnique({ where: { deviceId: "LED-CLI-1" } })).toMatchObject({
      username: "LED-CLI-1",
      kind: "DEVICE",
      deviceType: "LED_CONTROLLER",
    });
  });

  it("lists without hashes and deletes", async () => {
    await upsertMqttAccount(prisma, upsertCmd(["--username", "cli-svc", "--kind", "service"]));
    const rows = (await listMqttAccounts(prisma)).filter((r) => NAMES.includes(r.username));
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("passwordHash");

    expect(await deleteMqttAccount(prisma, "cli-svc")).toBe(true);
    expect(await deleteMqttAccount(prisma, "cli-svc")).toBe(false);
    expect(await prisma.mqttAccount.findUnique({ where: { username: "cli-svc" } })).toBeNull();
  });
});
