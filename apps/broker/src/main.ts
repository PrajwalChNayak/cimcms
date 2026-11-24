import "dotenv/config";
import { PrismaClient } from "./generated/prisma/index.js";
import { startBroker } from "./broker.js";
import { log } from "./log.js";

/**
 * Entry point. Environment:
 *   BROKER_DATABASE_URL  broker PostgreSQL database (separate from the app database)
 *   BROKER_PORT          plain MQTT port (default 1883)
 *   BROKER_TLS_PORT      MQTTS port (default 8883; only with cert + key)
 *   BROKER_TLS_CERT      path to the certificate chain (PEM), e.g. fullchain.pem
 *   BROKER_TLS_KEY       path to the private key (PEM)
 *   BROKER_HEALTH_PORT   HTTP health check port (default 8081)
 *   BROKER_MAX_MSGS_PER_SEC / BROKER_MSG_BURST   per-client publish rate (default 20/s, burst 100)
 *   BROKER_MAX_PAYLOAD_BYTES                     largest message (default 65536)
 *   BROKER_MAX_CONN_PER_IP / BROKER_MAX_CONNECTIONS  connection caps (default 200 / 10000)
 *   BROKER_LOG=silent    no log output
 */
const prisma = new PrismaClient({ datasourceUrl: process.env.BROKER_DATABASE_URL });

const num = (v: string | undefined, d: number): number => (v && /^\d+$/.test(v) ? Number(v) : d);

const broker = await startBroker({
  prisma,
  port: num(process.env.BROKER_PORT, 1883),
  tlsPort: num(process.env.BROKER_TLS_PORT, 8883),
  tlsCertFile: process.env.BROKER_TLS_CERT || undefined,
  tlsKeyFile: process.env.BROKER_TLS_KEY || undefined,
  healthPort: num(process.env.BROKER_HEALTH_PORT, 8081),
  maxMessagesPerSecond: num(process.env.BROKER_MAX_MSGS_PER_SEC, 20),
  messageBurst: num(process.env.BROKER_MSG_BURST, 100),
  maxPayloadBytes: num(process.env.BROKER_MAX_PAYLOAD_BYTES, 65536),
  maxConnectionsPerIp: num(process.env.BROKER_MAX_CONN_PER_IP, 200),
  maxConnections: num(process.env.BROKER_MAX_CONNECTIONS, 10000),
});

// Last-resort guards: log and exit so Docker restarts a clean process.
process.on("unhandledRejection", (reason) => log.error("unhandled rejection", { error: String(reason) }));
process.on("uncaughtException", (err) => {
  log.error("uncaught exception: exiting", { error: err.stack ?? String(err) });
  process.exit(1);
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
