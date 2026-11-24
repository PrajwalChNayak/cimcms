import MqttClient from "@/mqtt/mqtt.client";
import prisma from "@models/prisma.client";

const DB_PING_TIMEOUT_MS = 2000;

export interface SystemStatus {
  status: "ok" | "unavailable";
  database: "up" | "down";
  mqtt: "up" | "down";
}

/** Dependency health: used by the unauthenticated probes and by the admin system page. */
export default class SystemService {
  static async databaseUp(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("database ping timeout")), DB_PING_TIMEOUT_MS);
      });
      await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
      return true;
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  static async status(): Promise<SystemStatus> {
    const [database, mqtt] = [await SystemService.databaseUp(), MqttClient.isConnected()];
    return {
      status: database && mqtt ? "ok" : "unavailable",
      database: database ? "up" : "down",
      mqtt: mqtt ? "up" : "down",
    };
  }
}
