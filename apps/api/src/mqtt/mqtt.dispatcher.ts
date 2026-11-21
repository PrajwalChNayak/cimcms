import { MAX_MQTT_PAYLOAD_BYTES, parseTopic, type DeviceType } from "@cimcms/contracts";
import type { IPublishPacket } from "mqtt";
import { getDriver, handlesKind } from "@/drivers/driver.registry";
import IngestService from "@services/ingest.service";
import prisma from "@models/prisma.client";
import logger from "@utils/logger.utils";
import MqttClient from "./mqtt.client";

const CACHE_TTL_MS = 60_000;
const UNREGISTERED_LOG_INTERVAL_MS = 10 * 60_000;

const typeCache = new Map<string, { type: Promise<string | null>; at: number }>();
const unregisteredLoggedAt = new Map<string, number>();

/**
 * Cached per device. The cache holds the pending promise, so messages that
 * arrive together share one lookup and continue in arrival order (an ack must
 * not overtake the event that came before it).
 */
function lookupDeviceType(deviceId: string): Promise<string | null> {
  const hit = typeCache.get(deviceId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.type;
  const type = prisma.device
    .findUnique({ where: { deviceId }, select: { deviceType: true } })
    .then((device) => device?.deviceType ?? null);
  typeCache.set(deviceId, { type, at: Date.now() });
  type.catch(() => typeCache.delete(deviceId));
  return type;
}

export class MqttDispatcher {
  static clearCache(): void {
    typeCache.clear();
    unregisteredLoggedAt.clear();
  }

  static async dispatch(topic: string, payload: Buffer, packet: IPublishPacket): Promise<void> {
    try {
      if (payload.length > MAX_MQTT_PAYLOAD_BYTES) {
        logger.warn("MQTT payload too large, dropped", { topic, bytes: payload.length });
        return;
      }
      const parsed = parseTopic(topic);
      if (!parsed) {
        logger.debug("MQTT topic ignored", { topic });
        return;
      }
      const { deviceId, kind } = parsed;

      const storedType = await lookupDeviceType(deviceId);
      if (!storedType) {
        const last = unregisteredLoggedAt.get(deviceId) ?? 0;
        if (Date.now() - last >= UNREGISTERED_LOG_INTERVAL_MS) {
          unregisteredLoggedAt.set(deviceId, Date.now());
          logger.warn("UNREGISTERED_DEVICE", { deviceId, topic });
        }
        return;
      }

      let type: DeviceType;
      try {
        type = getDriver(storedType).type;
      } catch {
        // Stored type is not a known driver type: fall back to the topic's type.
        type = parsed.type;
      }
      if (type !== parsed.type || !handlesKind(type, kind)) {
        logger.debug("MQTT message not handled by driver", { topic, type, kind });
        return;
      }

      await IngestService.handle(kind, deviceId, type, payload.toString("utf8"), {
        retained: packet.retain === true,
      });
    } catch (err) {
      logger.error("MQTT dispatch failed", { topic, error: String(err) });
    }
  }

  /** Registers the dispatcher on the MQTT client. */
  static attach(): void {
    MqttClient.onMessage((t, p, k) => MqttDispatcher.dispatch(t, p, k));
  }
}

export default MqttDispatcher;
