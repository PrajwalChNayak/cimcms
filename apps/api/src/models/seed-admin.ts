import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { seedAdmin } from "@models/seed/admin";
dotenv.config();

// Usage: npm run seed:admin -w apps/api -- --email <email>
// The password comes from BOOTSTRAP_ADMIN_PASSWORD and is never printed.
function emailArg(argv: string[]): string {
  const i = argv.indexOf("--email");
  const v = i >= 0 ? argv[i + 1] : undefined;
  if (!v) throw new Error("Usage: seed:admin -- --email <email>");
  return v;
}

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function main(): Promise<void> {
  const email = emailArg(process.argv.slice(2));
  const res = await seedAdmin(prisma, email, process.env.BOOTSTRAP_ADMIN_PASSWORD);
  console.log(`${res.created ? "Created" : "Updated"} ADMIN user ${res.email}`);
}

main()
  .catch((e: unknown) => {
    console.error("seed:admin failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
