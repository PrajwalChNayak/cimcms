import { execFileSync } from "node:child_process";
import path from "node:path";
import { MongoMemoryReplSet } from "mongodb-memory-server";

let replSet: MongoMemoryReplSet | undefined;

/**
 * Vitest global setup: starts an in-memory single-node replica set (Prisma needs
 * one for transactions) and creates the collections/indexes from schema.prisma.
 * DATABASE_URL is set here, before any worker imports the Prisma client.
 * No Docker needed.
 */
export async function setup(): Promise<void> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = new URL(replSet.getUri());
  uri.pathname = "/cimcms_test";
  process.env.DATABASE_URL = uri.toString();

  const apiDir = path.resolve(__dirname, "..", "..");
  execFileSync(
    process.execPath,
    [
      path.resolve(apiDir, "..", "..", "node_modules", "prisma", "build", "index.js"),
      "db",
      "push",
      "--skip-generate",
      "--schema",
      "src/models/tables/schema.prisma",
    ],
    {
      cwd: apiDir,
      env: { ...process.env, DATABASE_URL: uri.toString() },
      stdio: "pipe",
    },
  );
}

export async function teardown(): Promise<void> {
  await replSet?.stop();
}
