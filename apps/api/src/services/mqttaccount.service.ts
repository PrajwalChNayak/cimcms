import {
  BROKER_ACCOUNT_CHANGED_TOPIC,
  DEVICE_TYPES,
  topicFor,
  type DeviceTopicsDto,
  type DeviceType,
  type MqttAccountDto,
  type MqttCredentialsDto,
  type MqttProvisioningMode,
  type TopicKind,
} from "@cimcms/contracts";
import MqttClient from "@/mqtt/mqtt.client";
import prisma from "@models/prisma.client";
import AuditService from "@services/audit.service";
import Argon from "@utils/argon.utils";
import { AppError } from "@utils/errors/custom.errors";
import logger from "@utils/logger.utils";
import { newMqttPassword } from "@utils/mqttpassword.utils";
import brokerPrisma from "@models/broker-prisma.client";

const PUBLISH_KINDS: readonly TopicKind[] = ["status", "telemetry", "ack", "event"];
const SUBSCRIBE_KINDS: readonly TopicKind[] = ["command", "config"];

export interface AccountActor {
  userId?: string | null;
  email?: string | null;
  ip?: string | null;
  requestId?: string | null;
}

/**
 * Broker accounts for devices. The CIMCMS broker (apps/broker) reads the `MqttAccount` table on
 * every connect, so a change here is effective at once. With MQTT_PROVISIONING=manual the API does
 * not create accounts (an operator uses `npm run mqtt:account`); otherwise ("broker", the default)
 * it creates, resets and deletes the device's account. A device account's username and client id
 * are its deviceId; the broker limits it to its own topics.
 */
export default class MqttAccountService {
  static mode(): MqttProvisioningMode {
    return process.env.MQTT_PROVISIONING === "manual" ? "manual" : "broker";
  }

  static brokerUrl(): string | null {
    return process.env.MQTT_DEVICE_URL?.trim() || null;
  }

  static topics(type: DeviceType, deviceId: string): DeviceTopicsDto {
    return {
      base: `cimcms/${DEVICE_TYPES[type].topicSegment}/${deviceId}`,
      publish: PUBLISH_KINDS.map((k) => topicFor(type, deviceId, k)),
      subscribe: SUBSCRIBE_KINDS.map((k) => topicFor(type, deviceId, k)),
    };
  }

  private static async device(id: string): Promise<{ deviceId: string; deviceType: DeviceType }> {
    const d = await prisma.device.findUnique({ where: { id }, select: { deviceId: true, deviceType: true } });
    if (!d) throw new AppError("Device not found", 404, "DEVICE_NOT_FOUND");
    return { deviceId: d.deviceId, deviceType: d.deviceType as DeviceType };
  }

  private static requireBroker(): void {
    if (MqttAccountService.mode() !== "broker") {
      throw new AppError(
        "Automatic broker accounts are disabled (MQTT_PROVISIONING=manual). Create the account with `npm run mqtt:account`.",
        409,
        "MQTT_PROVISIONING_DISABLED",
      );
    }
  }

  private static credentials(type: DeviceType, deviceId: string, password: string): MqttCredentialsDto {
    return {
      username: deviceId,
      clientId: deviceId,
      password,
      brokerUrl: MqttAccountService.brokerUrl(),
      topics: MqttAccountService.topics(type, deviceId),
    };
  }

  /**
   * Tells the broker to drop the live sessions of `username`. Best effort: when MQTT is down the
   * broker still checks the database on the next connect.
   */
  static notifyAccountChanged(username: string): void {
    MqttClient.publish(BROKER_ACCOUNT_CHANGED_TOPIC, JSON.stringify({ username }), { qos: 1 }).catch(
      (e: unknown) => {
        logger.warn("Broker account-changed notification failed", {
          username,
          error: e instanceof Error ? e.message : String(e),
        });
      },
    );
  }

  /**
   * Creates the device's account (or replaces it) with a new password.
   * The password is in the result only; the caller shows it once.
   */
  static async provision(deviceId: string, type: DeviceType, actor: AccountActor = {}): Promise<MqttCredentialsDto> {
    MqttAccountService.requireBroker();
    const password = newMqttPassword();
    let existed: boolean;
    try {
      const existing = await brokerPrisma.mqttAccount.findUnique({ where: { username: deviceId } });
      if (existing && existing.kind !== "DEVICE") {
        throw new AppError(
          `A ${existing.kind.toLowerCase()} broker account named ${deviceId} already exists`,
          409,
          "MQTT_ACCOUNT_CONFLICT",
        );
      }
      existed = !!existing;
      const passwordHash = await Argon.hashPassword(password);
      const now = new Date();
      await brokerPrisma.mqttAccount.upsert({
        where: { username: deviceId },
        create: { username: deviceId, passwordHash, kind: "DEVICE", deviceId, deviceType: type, passwordSetAt: now },
        update: { passwordHash, kind: "DEVICE", deviceId, deviceType: type, enabled: true, passwordSetAt: now },
      });
    } catch (e) {
      if (e instanceof AppError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      throw new AppError(`The broker account could not be created: ${msg}`, 500, "MQTT_PROVISIONING_FAILED");
    }
    await MqttAccountService.audit("MQTT_ACCOUNT_CREATED", deviceId, actor);
    if (existed) MqttAccountService.notifyAccountChanged(deviceId);
    return MqttAccountService.credentials(type, deviceId, password);
  }

  /** New password for an existing account; creates the account when there is none. */
  static async resetPassword(id: string, actor: AccountActor = {}): Promise<MqttCredentialsDto> {
    MqttAccountService.requireBroker();
    const { deviceId, deviceType } = await MqttAccountService.device(id);
    const record = await brokerPrisma.mqttAccount.findUnique({ where: { deviceId } });
    if (!record) return MqttAccountService.provision(deviceId, deviceType, actor);

    const password = newMqttPassword();
    await brokerPrisma.mqttAccount.update({
      where: { id: record.id },
      data: { passwordHash: await Argon.hashPassword(password), deviceType, passwordSetAt: new Date() },
    });
    await MqttAccountService.audit("MQTT_PASSWORD_RESET", deviceId, actor);
    MqttAccountService.notifyAccountChanged(record.username);
    return MqttAccountService.credentials(deviceType, deviceId, password);
  }

  /**
   * Deletes the device's broker account, if any. Done in both modes: a login must not outlive
   * its device, even when an operator created it by hand.
   */
  static async remove(deviceId: string, actor: AccountActor = {}): Promise<void> {
    const record = await brokerPrisma.mqttAccount.findUnique({ where: { deviceId } });
    if (!record) return;
    await brokerPrisma.mqttAccount.delete({ where: { id: record.id } });
    await MqttAccountService.audit("MQTT_ACCOUNT_REMOVED", deviceId, actor);
    MqttAccountService.notifyAccountChanged(record.username);
  }

  static async status(id: string): Promise<MqttAccountDto> {
    const { deviceId, deviceType } = await MqttAccountService.device(id);
    const record = await brokerPrisma.mqttAccount.findUnique({ where: { deviceId } });
    return {
      provisioning: MqttAccountService.mode(),
      exists: !!record,
      username: deviceId,
      clientId: deviceId,
      createdAt: record?.createdAt.toISOString() ?? null,
      passwordSetAt: record?.passwordSetAt.toISOString() ?? null,
      brokerUrl: MqttAccountService.brokerUrl(),
      topics: MqttAccountService.topics(deviceType, deviceId),
    };
  }

  private static async audit(action: string, deviceId: string, actor: AccountActor): Promise<void> {
    await AuditService.record({
      action,
      entity: "Device",
      entityId: deviceId,
      actorId: actor.userId ?? null,
      actorEmail: actor.email ?? null,
      data: { deviceId, method: "broker" }, // never the password
      ip: actor.ip ?? null,
      requestId: actor.requestId ?? null,
    });
  }
}
