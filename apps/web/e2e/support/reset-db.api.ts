/**
 * Runs with apps/api as cwd through tsx (see global-setup.ts):
 *   E2E_ADMIN_DATABASE_URL=<.../postgres> E2E_DB_NAME=cimcms_e2e tsx e2e/support/reset-db.api.ts
 * Drops and recreates the scratch database. Refuses any name that does not start with cimcms_e2e.
 * Uses Prisma raw statements (one statement per call, outside a transaction), so no local psql
 * and no Docker container are needed.
 */
import { PrismaClient } from "@prisma/client";

async function main(): Promise<void> {
  const name = process.env.E2E_DB_NAME ?? "";
  if (!/^cimcms_e2e[A-Za-z0-9_]*$/.test(name)) {
    throw new Error("Refusing to reset: E2E_DB_NAME must start with cimcms_e2e (letters, digits, _)");
  }
  const prisma = new PrismaClient({ datasourceUrl: process.env.E2E_ADMIN_DATABASE_URL });
  try {
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await prisma.$disconnect();
  }
  console.log("e2e database reset");
}

main().catch((e: unknown) => {
  console.error("e2e database reset failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
