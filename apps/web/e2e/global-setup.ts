import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { API_DIR, BROKER_DIR, E2E, WEB_DIR, adminDatabaseUrl, databaseUrl } from "./support/env";

/**
 * Expects a local PostgreSQL (see E2E.pgHost/pgPort in support/env.ts). Resets the scratch database
 * `cimcms_e2e` (NEVER the plain `cimcms` db), applies migrations, seeds it (users, LED-01 and the
 * broker logins in MqttAccount), starts the own broker (apps/broker, tsx) on free ports and waits
 * for its /health, then starts the API (tsx) against that broker and waits for /health/ready.
 * No Mosquitto and no passwd file are needed. The web dev server is started by Playwright
 * `webServer`. The device simulator is started per spec (support/led-sim.ts) because tests
 * stop/replace it.
 */

function tcpUp(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: 2000 });
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
    s.once("timeout", () => {
      s.destroy();
      resolve(false);
    });
  });
}

/**
 * `count` distinct free TCP ports (the OS picks them). All probe servers stay open until every
 * port is chosen, so the same port is never returned twice. Binds all interfaces like the broker.
 */
async function freePorts(count: number): Promise<number[]> {
  const servers: net.Server[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const srv = net.createServer();
      servers.push(srv);
      await new Promise<void>((resolve, reject) => {
        srv.once("error", reject);
        srv.listen(0, () => resolve());
      });
    }
    return servers.map((srv) => (srv.address() as net.AddressInfo).port);
  } finally {
    await Promise.all(servers.map((srv) => new Promise<void>((resolve) => srv.close(() => resolve()))));
  }
}

function run(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, label: string): void {
  const r = spawnSync(cmd, args, {
    cwd,
    env,
    encoding: "utf8",
    shell: process.platform === "win32" && cmd === "npx",
  });
  if (r.status !== 0) {
    throw new Error(`${label} failed (exit ${r.status}): ${redact((r.stderr || r.stdout || "").slice(-1500))}`);
  }
}

function killTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
  else child.kill("SIGTERM");
}

/** Hides secrets in child output. Very short values (a local throwaway DB password) are skipped. */
const redact = (s: string): string =>
  [E2E.mqtt.backendPassword, E2E.mqtt.ledPassword, E2E.pgPassword]
    .filter((v) => v.length >= 6)
    .reduce((out, v) => out.replaceAll(v, "***"), s);

interface Child {
  child: ChildProcess;
  log: () => string;
  exited: () => boolean;
}

/** Starts `node <args>` and keeps the last 4000 characters of its output for error messages. */
function startChild(args: string[], cwd: string, env: NodeJS.ProcessEnv): Child {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let done = false;
  const keep = (b: Buffer): void => {
    out = (out + b.toString()).slice(-4000);
  };
  child.stdout?.on("data", keep);
  child.stderr?.on("data", keep);
  child.once("exit", () => {
    done = true;
  });
  return { child, log: () => out, exited: () => done };
}

async function waitHealthy(name: string, url: string, proc: Child, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (proc.exited()) throw new Error(`${name} exited during start-up. Last output:\n${redact(proc.log())}`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      killTree(proc.child);
      throw new Error(`${name} not ready after ${timeoutMs / 1000} s. Last output:\n${redact(proc.log())}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  if (E2E.dbName === "cimcms" || !E2E.dbName.startsWith("cimcms_e2e")) {
    throw new Error("E2E_DB_NAME must start with cimcms_e2e (never use the dev database)");
  }
  if (!(await tcpUp(E2E.pgHost, E2E.pgPort))) {
    throw new Error(
      `PostgreSQL is not reachable on ${E2E.pgHost}:${E2E.pgPort}. Start a local one (see e2e/support/env.ts) or set E2E_PG_HOST/E2E_PG_PORT/E2E_PG_USER/E2E_PG_PASSWORD.`,
    );
  }

  // Own broker on free ports. Exported so the Playwright workers (led-sim.ts) inherit them.
  const [brokerPort, healthPort] = await freePorts(2);
  process.env.E2E_BROKER_PORT ||= String(brokerPort);
  process.env.E2E_BROKER_HEALTH_PORT ||= String(healthPort);
  const mqttUrl = E2E.mqttUrl;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "development",
    PORT: String(E2E.apiPort),
    MAIN_ROUTE: E2E.mainRoute,
    DATABASE_URL: databaseUrl,
    DB_DIALECT: "postgresql",
    JWT_SECRET_KEY: randomBytes(32).toString("base64url"),
    SESSION_SECRET_KEY: randomBytes(32).toString("base64url"),
    APP_BASE_URL: `http://localhost:${E2E.webPort}`,
    ACCESS_TOKEN_TTL: "15m",
    REFRESH_TOKEN_TTL_DAYS: "7",
    REFRESH_COOKIE_NAME: "cimcms_rt",
    REFRESH_COOKIE_PATH: "/api/user/token",
    MQTT_URL: mqttUrl,
    MQTT_USERNAME: E2E.mqtt.backendUser,
    MQTT_PASSWORD: E2E.mqtt.backendPassword,
    MQTT_CLIENT_ID: `cimcms-e2e-${randomBytes(4).toString("hex")}`,
    MQTT_CA_FILE: "",
    MQTT_PROVISIONING: "broker",
    MQTT_DEVICE_URL: mqttUrl,
    MONITOR_HUMIDIFIER: "false",
    API_DOCS_ENABLED: "false",
    SEED_DEVICES: "LED-01:LED_CONTROLLER:LED Controller 1",
    ARGON2_MEMORY_COST: "19456",
    ARGON2_TIME_COST: "2",
    ARGON2_PARALLELISM: "1",
    ARGON2_HASH_LENGTH: "32",
    E2E_ADMIN_PASSWORD: E2E.users.admin.password,
    E2E_VIEWER_PASSWORD: E2E.users.viewer.password,
    E2E_TECH_PASSWORD: E2E.users.tech.password,
    E2E_MQTT_BACKEND_PASSWORD: E2E.mqtt.backendPassword,
    E2E_MQTT_LED01_PASSWORD: E2E.mqtt.ledPassword,
  };
  // Placeholders for unrelated settings so the API starts without a local apps/api/.env (CI).
  const placeholders: Record<string, string> = {
    MAIL_DRIVER: "smtp", MAIL_HOST: "localhost", MAIL_PORT: "25", MAIL_USERNAME: "x", MAIL_PASSWORD: "x",
    CLOUD_ENDPOINT: "localhost", CLOUD_PORT: "9000", CLOUD_USE_SSL: "false", CLOUD_ACCESS_KEY: "x",
    CLOUD_SECRET_KEY: "x", CLOUD_BUCKET_NAME: "x", USER_FOLDER: "users",
  };
  for (const [k, v] of Object.entries(placeholders)) env[k] ??= v;
  // Settings of the old Mosquitto Dynamic Security mode must not leak in from a local shell.
  delete env.MQTT_ADMIN_USERNAME;
  delete env.MQTT_ADMIN_PASSWORD;

  const tsxCli = createRequire(path.join(API_DIR, "package.json")).resolve("tsx/cli");

  // 1. reset the scratch DB (guarded name; Prisma raw statements, no psql/docker needed)
  run(
    process.execPath,
    [tsxCli, path.join(WEB_DIR, "e2e/support/reset-db.api.ts")],
    API_DIR,
    { ...env, E2E_ADMIN_DATABASE_URL: adminDatabaseUrl, E2E_DB_NAME: E2E.dbName },
    "reset scratch database",
  );

  // 2. schema (real migrations) + seed (incl. broker logins in MqttAccount)
  run("npx", ["prisma", "migrate", "deploy"], API_DIR, env, "prisma migrate deploy");
  run(process.execPath, [tsxCli, path.join(WEB_DIR, "e2e/support/seed.api.ts")], API_DIR, env, "seed");

  // 3. own broker (never runs migrations; TLS off because no cert/key)
  const broker = startChild([tsxCli, "src/main.ts"], BROKER_DIR, {
    ...process.env,
    DATABASE_URL: databaseUrl,
    BROKER_PORT: process.env.E2E_BROKER_PORT,
    BROKER_HEALTH_PORT: process.env.E2E_BROKER_HEALTH_PORT,
    BROKER_TLS_CERT: "",
    BROKER_TLS_KEY: "",
    BROKER_LOG: "",
  });
  await waitHealthy("Broker", `http://localhost:${process.env.E2E_BROKER_HEALTH_PORT}/health`, broker, 60_000);

  // 4. API
  const api = startChild([tsxCli, "app.ts"], API_DIR, env);
  try {
    await waitHealthy("API", `http://localhost:${E2E.apiPort}/health/ready`, api, 90_000);
  } catch (e) {
    killTree(broker.child);
    throw e;
  }

  return async () => {
    killTree(api.child);
    killTree(broker.child);
  };
}
