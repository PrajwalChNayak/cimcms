import type { PrismaClient } from "@prisma/client";
import defaultPrisma from "@models/prisma.client";
import logger from "@utils/logger.utils";

/** MongoDB error code NamespaceExists. */
const NAMESPACE_EXISTS = 48;

/** One year. TODO(owner-decision O-7): retention period is not confirmed. */
export const TELEMETRY_EXPIRE_AFTER_SECONDS = 365 * 24 * 3600;

function errorCode(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const e = err as { code?: unknown; meta?: { code?: unknown } };
  const raw = e.meta?.code ?? e.code;
  return typeof raw === "number" ? raw : Number(raw);
}

/**
 * Creates the `telemetry` time-series collection. Idempotent: an already
 * existing collection (error code 48, or a Prisma P2010 wrapping it) is fine.
 */
export async function initTimeseries(
  prisma: PrismaClient = defaultPrisma,
): Promise<void> {
  try {
    await prisma.$runCommandRaw({
      create: "telemetry",
      timeseries: { timeField: "ts", metaField: "meta", granularity: "seconds" },
      expireAfterSeconds: TELEMETRY_EXPIRE_AFTER_SECONDS, // TODO(owner-decision O-7)
    });
    logger.info("Created time-series collection 'telemetry'");
  } catch (err) {
    if (errorCode(err) === NAMESPACE_EXISTS) return;
    const msg = err instanceof Error ? err.message : String(err);
    if (/NamespaceExists|already exists/i.test(msg)) return;
    throw err;
  }
}
