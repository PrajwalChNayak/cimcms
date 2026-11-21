import MqttClient from "@/mqtt/mqtt.client";
import prisma from "@models/prisma.client";
import { Router, type Request, type Response } from "express";

const MONGO_PING_TIMEOUT_MS = 2000;

async function mongoUp(): Promise<boolean> {
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

/**
 * Health probes for Docker / Nginx / uptime checks. Mounted at the app root
 * (outside MAIN_ROUTE), before the rate limiter, no authentication.
 * Output carries no secrets, versions or host names.
 */
const healthRouter = Router();

healthRouter.get("/live", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

healthRouter.get("/ready", async (_req: Request, res: Response) => {
  const [mongo, mqtt] = [await mongoUp(), MqttClient.isConnected()];
  const ready = mongo && mqtt;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "unavailable",
    mongo: mongo ? "up" : "down",
    mqtt: mqtt ? "up" : "down",
  });
});

export default healthRouter;
