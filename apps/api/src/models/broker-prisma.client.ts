import { PrismaClient as BrokerPrismaClient } from "@cimcms/broker/prisma";

export { BrokerPrismaClient };
export type { MqttAccountKind } from "@cimcms/broker/prisma";

/**
 * Client for the broker database (tables MqttAccount, MqttRetained), separate from the
 * application database. BROKER_DATABASE_URL is required wherever broker logins are written.
 */
const brokerPrisma: BrokerPrismaClient = new BrokerPrismaClient({
  datasourceUrl: process.env.BROKER_DATABASE_URL,
  log: ["warn", "error"],
});

export default brokerPrisma;
