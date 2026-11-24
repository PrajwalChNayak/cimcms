import "dotenv/config";
import http from "node:http";
import { createApp } from "@/createApp";
import { startJobs, stopJobs } from "@/jobs";
import MqttClient from "@/mqtt/mqtt.client";
import { startMqtt } from "@/mqtt";
import { attachRealtime, closeRealtime } from "@/realtime";
import prisma from "@models/prisma.client";
import logger from "@utils/logger.utils";

const app = createApp();
const server = http.createServer(app);

/**
 * Orderly shutdown (D13): stop jobs, close sockets and the HTTP listener, tell the
 * broker we are offline, and only then disconnect the database.
 */
let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info(`${signal} received, shutting down`);
  let code = 0;
  try {
    stopJobs();
    await closeRealtime(); // also closes the HTTP server
    if (server.listening) await new Promise<void>((r) => server.close(() => r()));
    await MqttClient.shutdown();
    await prisma.$disconnect();
  } catch (err) {
    logger.error("Error during shutdown", err);
    code = 1;
  }
  process.exit(code);
}

async function bootstrap(): Promise<void> {
  // Schema changes are applied by `prisma migrate deploy` before the process starts
  // (docker entrypoint / deploy runbook), never at runtime. Connect now so the first
  // request (and the first readiness probe) does not pay the connection start-up.
  await prisma.$connect();
  attachRealtime(server);

  // Not awaited: the API must serve requests while the broker is down
  // (commands answer 503 until the client connects).
  startMqtt().catch((err: unknown) => {
    logger.error("MQTT start failed", { error: String(err) });
  });
  startJobs();

  server.listen(process.env.PORT, () => {
    logger.info(`App is Running ON PORT => ${process.env.PORT}`);
    if (process.env.API_DOCS_ENABLED === "true") {
      logger.info(
        `API Documentation available at http://localhost:${process.env.PORT}/api-docs`,
      );
    }
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

bootstrap().catch((err: unknown) => {
  logger.error("Bootstrap failed", err);
  process.exit(1);
});
