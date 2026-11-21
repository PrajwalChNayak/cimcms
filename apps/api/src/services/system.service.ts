import MqttClient from "@/mqtt/mqtt.client";
import prisma from "@models/prisma.client";

const MONGO_PING_TIMEOUT_MS = 2000;

export interface SystemStatus {
  status: "ok" | "unavailable";
  mongo: "up" | "down";
  mqtt: "up" | "down";
}

/** Dependency health: used by the unauthenticated probes and by the admin system page. */
export default class SystemService {
  static async mongoUp(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("mongo ping timeout")), MONGO_PING_TIMEOUT_MS);
      });
      await Promise.race([prisma.$runCommandRaw({ ping: 1 }), timeout]);
      return true;
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  static async status(): Promise<SystemStatus> {
    const [mongo, mqtt] = [await SystemService.mongoUp(), MqttClient.isConnected()];
    return {
      status: mongo && mqtt ? "ok" : "unavailable",
      mongo: mongo ? "up" : "down",
      mqtt: mqtt ? "up" : "down",
    };
  }
}
