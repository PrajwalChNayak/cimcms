import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { startBroker } from "./broker.js";
import { log } from "./log.js";

/**
 * Entry point. Environment:
 *   DATABASE_URL         CIMCMS PostgreSQL (same database as the API)
 *   BROKER_PORT          plain MQTT port (default 1883)
 *   BROKER_TLS_PORT      MQTTS port (default 8883; only with cert + key)
 *   BROKER_TLS_CERT      path to the certificate chain (PEM), e.g. fullchain.pem
 *   BROKER_TLS_KEY       path to the private key (PEM)
 *   BROKER_HEALTH_PORT   HTTP health check port (default 8081)
 *   BROKER_LOG=silent    no log output
 */
const prisma = new PrismaClient();

const num = (v: string | undefined, d: number): number => (v && /^\d+$/.test(v) ? Number(v) : d);

const broker = await startBroker({
  prisma,
  port: num(process.env.BROKER_PORT, 1883),
  tlsPort: num(process.env.BROKER_TLS_PORT, 8883),
  tlsCertFile: process.env.BROKER_TLS_CERT || undefined,
  tlsKeyFile: process.env.BROKER_TLS_KEY || undefined,
  healthPort: num(process.env.BROKER_HEALTH_PORT, 8081),
});

let stopping = false;
const stop = async (signal: string): Promise<void> => {
  if (stopping) return;
  stopping = true;
  log.info("stopping", { signal });
  await broker.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.once("SIGINT", () => void stop("SIGINT"));
process.once("SIGTERM", () => void stop("SIGTERM"));
