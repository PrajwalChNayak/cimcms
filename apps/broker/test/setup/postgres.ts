import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import EmbeddedPostgres from "embedded-postgres";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));

let pg: EmbeddedPostgres | undefined;
let dataDir: string | undefined;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Vitest global setup (same approach as apps/api/test/setup/postgres.ts).
 * Uses TEST_DATABASE_URL when set; otherwise starts a throw-away embedded PostgreSQL 16.
 * Applies the API's real migrations, and sets DATABASE_URL before any test creates a PrismaClient.
 */
export async function setup(): Promise<void> {
  let url = process.env.TEST_DATABASE_URL;
  if (url && !/test/i.test(new URL(url).pathname)) {
    throw new Error("TEST_DATABASE_URL must point to a database whose name contains 'test'");
  }
  if (!url) {
    const port = await freePort();
    dataDir = mkdtempSync(path.join(os.tmpdir(), "cimcms-broker-pg-"));
    // Throw-away credentials for a server that listens on 127.0.0.1 only and is deleted after the run.
    const password = "test-only";
    pg = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: "postgres",
      password,
      port,
      persistent: false,
      onLog: () => undefined,
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase("cimcms_test");
    url = `postgresql://postgres:${password}@127.0.0.1:${port}/cimcms_test?schema=public`;
  }
  process.env.DATABASE_URL = url;

  const brokerDir = path.resolve(here, "..", "..");
  await execFileAsync(
    process.execPath,
    [
      path.resolve(brokerDir, "..", "..", "node_modules", "prisma", "build", "index.js"),
      "migrate",
      process.env.TEST_DATABASE_URL ? "reset" : "deploy",
      ...(process.env.TEST_DATABASE_URL ? ["--force", "--skip-generate", "--skip-seed"] : []),
      "--schema",
      "../api/src/models/tables/schema.prisma",
    ],
    { cwd: brokerDir, env: { ...process.env, DATABASE_URL: url } },
  );
}

export async function teardown(): Promise<void> {
  await pg?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
}
