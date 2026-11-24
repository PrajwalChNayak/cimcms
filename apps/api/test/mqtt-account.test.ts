import {
  mqttAccountDtoSchema,
  mqttCredentialsDtoSchema,
  registerDeviceResultDtoSchema,
  type MqttCredentialsDto,
  type RegisterDeviceResultDto,
} from "@cimcms/contracts";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import MqttClient from "@/mqtt/mqtt.client";
import brokerPrisma from "@models/broker-prisma.client";
import prisma from "@models/prisma.client";
import Argon from "@utils/argon.utils";
import { getTestApp } from "./helpers/app";
import { mintToken } from "./helpers/tokens";

/**
 * Automatic MQTT broker accounts: the API writes device logins to the MqttAccount table in the
 * broker database (which the CIMCMS broker reads on every connect) and tells the broker to drop live sessions after a
 * password reset or delete by publishing to cimcms/broker/account-changed.
 */
const API = "/api/v1";
const DEVICE_URL = "mqtt://192.0.2.10:1883";
// Written out (not imported) so a wrong topic in the API fails the test.
const ACCOUNT_CHANGED = "cimcms/broker/account-changed";
const IDS = ["LED-MA-1", "LED-MA-2", "LED-MA-3"] as const;
const [ID1, ID2, ID3] = IDS;
const admin = mintToken("ADMIN");
const operator = mintToken("OPERATOR");

const ENV_KEYS = ["MQTT_PROVISIONING", "MQTT_DEVICE_URL"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

let publish: MockInstance<typeof MqttClient.publish>;

const auth = (r: request.Test, token: string) => r.set("Authorization", `Bearer ${token}`);
const register = (deviceId: string, token = admin.token) =>
  auth(request(getTestApp()).post(`${API}/devices/register`), token).send({
    deviceId,
    deviceType: "LED_CONTROLLER",
    name: `MQTT account ${deviceId}`,
  });
const getAccount = (id: string, token = admin.token) =>
  auth(request(getTestApp()).get(`${API}/devices/${id}/mqtt-account`), token);
const resetPassword = (id: string, token = admin.token) =>
  auth(request(getTestApp()).post(`${API}/devices/${id}/mqtt-account/password`), token).send({});
const deleteDevice = (id: string, token = admin.token) =>
  auth(request(getTestApp()).delete(`${API}/devices/${id}`), token);

async function registerOk(deviceId: string): Promise<RegisterDeviceResultDto> {
  const res = await register(deviceId);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return registerDeviceResultDtoSchema.parse(res.body.result);
}

const audits = (action: string, deviceId: string) =>
  prisma.auditLog.findMany({ where: { action, entity: "Device", entityId: deviceId } });
const row = (username: string) => brokerPrisma.mqttAccount.findUnique({ where: { username } });
/** Usernames announced on the account-changed topic. */
const notified = (): string[] =>
  publish.mock.calls
    .filter(([topic]) => topic === ACCOUNT_CHANGED)
    .map(([, payload]) => (JSON.parse(payload) as { username: string }).username);

function restoreEnv(): void {
  for (const k of ENV_KEYS) {
    const v = savedEnv[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

async function cleanup(): Promise<void> {
  await prisma.device.deleteMany({ where: { deviceId: { in: [...IDS] } } });
  await brokerPrisma.mqttAccount.deleteMany({ where: { username: { in: [...IDS] } } });
  await prisma.auditLog.deleteMany({ where: { entity: "Device", entityId: { in: [...IDS] } } });
}

beforeAll(cleanup);

afterAll(async () => {
  restoreEnv();
  await cleanup();
  await prisma.$disconnect();
  await brokerPrisma.$disconnect();
});

beforeEach(async () => {
  publish = vi.spyOn(MqttClient, "publish").mockResolvedValue(undefined);
  delete process.env.MQTT_PROVISIONING; // default: broker
  process.env.MQTT_DEVICE_URL = DEVICE_URL;
  await cleanup();
});

afterEach(() => {
  vi.restoreAllMocks();
  restoreEnv();
});

describe("POST /devices/register in broker mode (default)", () => {
  it("creates a DEVICE account and returns the password once", async () => {
    const res = await register(ID1);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");

    const result = registerDeviceResultDtoSchema.parse(res.body.result);
    expect(result.provisioning).toBe("broker");
    expect(result.provisioningError).toBeNull();
    const creds = result.credentials as MqttCredentialsDto;
    expect(creds).not.toBeNull();
    expect(creds.password).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(creds).toMatchObject({ username: ID1, clientId: ID1, brokerUrl: DEVICE_URL });
    expect(creds.topics).toEqual({
      base: `cimcms/led/${ID1}`,
      publish: ["status", "telemetry", "ack", "event"].map((k) => `cimcms/led/${ID1}/${k}`),
      subscribe: ["command", "config"].map((k) => `cimcms/led/${ID1}/${k}`),
    });

    const account = await row(ID1);
    expect(account).toMatchObject({
      username: ID1,
      kind: "DEVICE",
      deviceId: ID1,
      deviceType: "LED_CONTROLLER",
      enabled: true,
    });
    expect(account!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(account!.passwordHash).not.toContain(creds.password);
    expect(await Argon.verifyPassword(creds.password, account!.passwordHash)).toBe(true);

    // A brand-new account has no sessions to drop.
    expect(notified()).toEqual([]);

    const created = await audits("MQTT_ACCOUNT_CREATED", ID1);
    expect(created).toHaveLength(1);
    expect(created[0]!.actorId).toBe(admin.userId);
    expect(created[0]!.data).toMatchObject({ deviceId: ID1, method: "broker" });
    expect(JSON.stringify(created[0]!.data)).not.toContain(creds.password);
  });

  it("GET /devices/:id/mqtt-account reports the account without any secret", async () => {
    const { device, credentials } = await registerOk(ID1);

    const res = await getAccount(device.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const account = mqttAccountDtoSchema.parse(res.body.result);
    expect(account).toMatchObject({ provisioning: "broker", exists: true, username: ID1, clientId: ID1 });
    expect(account.createdAt).not.toBeNull();
    expect(account.passwordSetAt).not.toBeNull();
    expect(JSON.stringify(res.body)).not.toContain(credentials!.password);
    expect(JSON.stringify(res.body)).not.toContain("argon2");
  });

  it("returns 404 for an unknown device", async () => {
    const res = await getAccount("00000000-0000-4000-8000-000000000000");
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe("DEVICE_NOT_FOUND");
  });

  it("reports a conflicting non-device account as provisioningError and keeps the device", async () => {
    await brokerPrisma.mqttAccount.create({
      data: { username: ID3, passwordHash: "x", kind: "SERVICE", passwordSetAt: new Date() },
    });
    const result = await registerOk(ID3);
    expect(result.credentials).toBeNull();
    expect(result.provisioningError).toMatch(/already exists/);
    expect(await prisma.device.findUnique({ where: { deviceId: ID3 } })).not.toBeNull();
    expect((await row(ID3))!.kind).toBe("SERVICE");
  });
});

describe("POST /devices/:id/mqtt-account/password", () => {
  it("replaces the stored hash and tells the broker", async () => {
    const { device, credentials } = await registerOk(ID1);
    const before = (await row(ID1))!;

    const res = await resetPassword(device.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    const creds = mqttCredentialsDtoSchema.parse(res.body.result);
    expect(creds.password).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(creds.password).not.toBe(credentials!.password);

    const after = (await row(ID1))!;
    expect(after.id).toBe(before.id);
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(await Argon.verifyPassword(creds.password, after.passwordHash)).toBe(true);
    expect(await Argon.verifyPassword(credentials!.password, after.passwordHash)).toBe(false);
    expect(after.passwordSetAt.getTime()).toBeGreaterThanOrEqual(before.passwordSetAt.getTime());

    expect(notified()).toEqual([ID1]);
    const reset = await audits("MQTT_PASSWORD_RESET", ID1);
    expect(reset).toHaveLength(1);
    expect(reset[0]!.actorId).toBe(admin.userId);
    expect(JSON.stringify(reset[0]!.data)).not.toContain(creds.password);
  });

  it("creates the account when the device has none yet (registered in manual mode)", async () => {
    process.env.MQTT_PROVISIONING = "manual";
    const { device } = await registerOk(ID2);
    expect(await row(ID2)).toBeNull();

    delete process.env.MQTT_PROVISIONING;
    const res = await resetPassword(device.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const creds = mqttCredentialsDtoSchema.parse(res.body.result);
    const account = (await row(ID2))!;
    expect(account.kind).toBe("DEVICE");
    expect(await Argon.verifyPassword(creds.password, account.passwordHash)).toBe(true);
    expect(await audits("MQTT_ACCOUNT_CREATED", ID2)).toHaveLength(1);
    expect(notified()).toEqual([]);
  });

  it("still succeeds when MQTT is down (notification is best effort)", async () => {
    const { device } = await registerOk(ID1);
    publish.mockRejectedValue(new Error("MQTT not connected"));

    const res = await resetPassword(device.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(notified()).toEqual([ID1]);
  });
});

describe("DELETE /devices/:id", () => {
  it("removes the broker account and tells the broker", async () => {
    const { device } = await registerOk(ID1);

    const res = await deleteDevice(device.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await row(ID1)).toBeNull();
    expect(await prisma.device.findUnique({ where: { deviceId: ID1 } })).toBeNull();
    expect(notified()).toEqual([ID1]);
    expect(await audits("MQTT_ACCOUNT_REMOVED", ID1)).toHaveLength(1);
  });
});

describe("manual mode (MQTT_PROVISIONING=manual)", () => {
  it("registers without credentials and refuses a password reset with 409", async () => {
    process.env.MQTT_PROVISIONING = "manual";

    const result = await registerOk(ID1);
    expect(result.provisioning).toBe("manual");
    expect(result.credentials).toBeNull();
    expect(result.provisioningError).toBeNull();
    expect(await row(ID1)).toBeNull();

    const status = mqttAccountDtoSchema.parse((await getAccount(result.device.id)).body.result);
    expect(status).toMatchObject({ provisioning: "manual", exists: false, username: ID1, brokerUrl: DEVICE_URL });

    const res = await resetPassword(result.device.id);
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe("MQTT_PROVISIONING_DISABLED");

    expect((await deleteDevice(result.device.id)).status).toBe(200);
    expect(notified()).toEqual([]);
  });
});

describe("permissions", () => {
  it("needs DEVICE_MANAGE for both broker account routes", async () => {
    const { device } = await registerOk(ID1);
    const before = (await row(ID1))!.passwordHash;

    expect((await getAccount(device.id, operator.token)).status).toBe(403);
    expect((await resetPassword(device.id, operator.token)).status).toBe(403);
    expect((await row(ID1))!.passwordHash).toBe(before);
    expect(notified()).toEqual([]);
  });
});
