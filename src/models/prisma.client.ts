import { PrismaClient } from "@prisma/client";
import logger from "@utils/logger.utils";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prismaOptions = {
  datasourceUrl: process.env.DATABASE_URL,
  log:
    process.env.NODE_ENV === "production"
      ? (["error"] as const)
      : (["query", "info", "warn", "error"] as const),
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

const shutdown = async (): Promise<void> => {
  try {
    logger.info("Disconnecting Prisma...");
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    logger.error("Error during Prisma disconnect:", error);
    process.exit(1);
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export default prisma;
