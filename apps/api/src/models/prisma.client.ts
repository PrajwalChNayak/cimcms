import { Prisma, PrismaClient } from "@prisma/client";
import logger from "@utils/logger.utils";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prismaOptions: Prisma.PrismaClientOptions = {
  datasourceUrl: process.env.DATABASE_URL,
  log:
    process.env.NODE_ENV === "production"
      ? ["error"]
      : ["query", "info", "warn", "error"],
};

let prisma: PrismaClient;

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient(prismaOptions);
} else {
  if (!global.prisma) {
    global.prisma = new PrismaClient(prismaOptions);
  }
  prisma = global.prisma;
}

if (process.env.NODE_ENV !== "production") {
  prisma.$on(
    "query" as never,
    (e: { query: string; params: string; duration: number }) => {
      logger.info(`Query: ${e.query}`);
      logger.info(`Params: ${e.params}`);
      logger.info(`Duration: ${e.duration}ms`);
    },
  );

  prisma.$on("info" as never, (e: { message: string }) => {
    logger.info(e.message);
  });

  prisma.$on("warn" as never, (e: { message: string }) => {
    logger.warn(e.message);
  });

  prisma.$on("error" as never, (e: { message: string }) => {
    logger.error(e.message);
  });
}

// No SIGINT/SIGTERM handler here: app.ts owns the shutdown order (jobs, sockets,
// MQTT offline publish, then Prisma disconnect). Scripts call $disconnect() themselves.

export default prisma;
