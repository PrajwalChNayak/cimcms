import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import EmbeddedPostgres from "embedded-postgres";

const execFileAsync = promisify(execFile);

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
 * Vitest global setup. Uses TEST_DATABASE_URL when set (for example a Postgres
 * service in CI); otherwise starts a throw-away embedded PostgreSQL 16 (no Docker).
 * Applies the real migrations with `prisma migrate deploy`, so tests also prove the
 * migration files. DATABASE_URL is set before any worker imports the Prisma client.
 * The broker schema (apps/broker/prisma) is migrated into the same database under
 * `?schema=broker`, and BROKER_DATABASE_URL points there.
 */
export async function setup(): Promise<void> {
  let url = process.env.TEST_DATABASE_URL;
  if (url && !/test/i.test(new URL(url).pathname)) {
    // The run resets this database. Refuse anything that does not look like a test database.
    throw new Error("TEST_DATABASE_URL must point to a database whose name contains 'test'");
  }
  if (!url) {
    const port = await freePort();
    dataDir = mkdtempSync(path.join(os.tmpdir(), "cimcms-pg-"));
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
  // The broker tables live in their own database in production. Tests use a separate Postgres
  // schema in the same test database, so the two _prisma_migrations tables do not clash.
  const brokerUrl = withSchema(url, "broker");
  process.env.BROKER_DATABASE_URL = brokerUrl;

  const apiDir = path.resolve(__dirname, "..", "..");
  const prismaCli = path.resolve(apiDir, "..", "..", "node_modules", "prisma", "build", "index.js");
  const reset = Boolean(process.env.TEST_DATABASE_URL);
  const migrate = (schema: string, env: NodeJS.ProcessEnv) =>
    execFileAsync(
      process.execPath,
      [
        prismaCli,
        "migrate",
        reset ? "reset" : "deploy",
        ...(reset ? ["--force", "--skip-generate", "--skip-seed"] : []),
        "--schema",
        schema,
      ],
      { cwd: apiDir, env: { ...process.env, ...env } },
    );

  await migrate("src/models/tables/schema.prisma", { DATABASE_URL: url });
  await migrate("../broker/prisma/schema.prisma", { BROKER_DATABASE_URL: brokerUrl });
}

/** Same connection string with `?schema=<schema>` (replacing any schema parameter). */
function withSchema(url: string, schema: string): string {
  const u = new URL(url);
  u.searchParams.set("schema", schema);
  return u.toString();
}

export async function teardown(): Promise<void> {
  await pg?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
}
