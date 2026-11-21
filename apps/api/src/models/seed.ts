import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { seedRbac } from "@models/seed/rbac";
import { parseSeedDevices, seedDevices } from "@models/seed/devices";
dotenv.config();

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

// Idempotent: safe to run any number of times.
async function seed(): Promise<void> {
  // Validate first so a bad SEED_DEVICES entry changes nothing.
  const devices = parseSeedDevices(process.env.SEED_DEVICES);

  const rbac = await seedRbac(prisma);
  console.log(`Seeded ${rbac.permissions} permissions and ${rbac.roles} roles.`);

  const count = await seedDevices(prisma, devices);
  console.log(`Seeded ${count} device(s) from SEED_DEVICES.`);
}

seed()
  .catch((e: unknown) => {
    console.error("Seed failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
