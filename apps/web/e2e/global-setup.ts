import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { API_DIR, COMPOSE_FILE, E2E, WEB_DIR, databaseUrl } from "./support/env";

/**
 * Expects dev infra up (`npm run dev:infra`). Resets the scratch database `cimcms_e2e`
 * (NEVER the plain `cimcms` db), seeds it, starts the API (tsx) against the dev broker, waits
 * for /health/ready. The web dev server is started by Playwright `webServer`.
 * The device simulator is started per spec (support/led-sim.ts) because tests stop/replace it.
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

function run(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, label: string): void {
  const r = spawnSync(cmd, args, {
    cwd,
    env,
    encoding: "utf8",
    shell: process.platform === "win32" && cmd === "npx",
  });
  if (r.status !== 0) {
    throw new Error(`${label} failed (exit ${r.status}): ${(r.stderr || r.stdout || "").slice(-1500)}`);
  }
}

function killTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
  else child.kill("SIGTERM");
}

const redact = (s: string): string =>
  s.replaceAll(E2E.mqtt.backendPassword, "***").replaceAll(E2E.mqtt.ledPassword, "***");

export default async function globalSetup(): Promise<() => Promise<void>> {
  if (E2E.dbName === "cimcms" || !E2E.dbName.startsWith("cimcms_e2e")) {
    throw new Error("E2E_DB_NAME must start with cimcms_e2e (never use the dev database)");
  }
  if (!(await tcpUp("localhost", 27017)) || !(await tcpUp("localhost", 1883))) {
    throw new Error("Dev infra is not running (mongo :27017 / mosquitto :1883). Run `npm run dev:infra` first.");
  }

  // 1. reset the scratch DB (guarded name; via compose exec so no local mongosh is needed)
  const drop = spawnSync(
    "docker",
    ["compose", "-f", COMPOSE_FILE, "exec", "-T", "mongo", "mongosh", "--quiet", "--eval", `db.getSiblingDB('${E2E.dbName}').dropDatabase().ok`],
    { encoding: "utf8" },
  );
  if (drop.status !== 0) throw new Error(`Could not reset ${E2E.dbName}: ${(drop.stderr || drop.stdout).slice(-500)}`);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "development",
    PORT: String(E2E.apiPort),
    MAIN_ROUTE: E2E.mainRoute,
    DATABASE_URL: databaseUrl,
    DB_DIALECT: "mongodb",
    JWT_SECRET_KEY: randomBytes(32).toString("base64url"),
    SESSION_SECRET_KEY: randomBytes(32).toString("base64url"),
    APP_BASE_URL: `http://localhost:${E2E.webPort}`,
    ACCESS_TOKEN_TTL: "15m",
    REFRESH_TOKEN_TTL_DAYS: "7",
    REFRESH_COOKIE_NAME: "cimcms_rt",
    REFRESH_COOKIE_PATH: "/api/user/token",
    MQTT_URL: E2E.mqttUrl,
    MQTT_USERNAME: E2E.mqtt.backendUser,
    MQTT_PASSWORD: E2E.mqtt.backendPassword,
    MQTT_CLIENT_ID: `cimcms-e2e-${randomBytes(4).toString("hex")}`,
    MQTT_CA_FILE: "",
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
  };
  // Placeholders for unrelated settings so the API starts without a local apps/api/.env (CI).
  const placeholders: Record<string, string> = {
    MAIL_DRIVER: "smtp", MAIL_HOST: "localhost", MAIL_PORT: "25", MAIL_USERNAME: "x", MAIL_PASSWORD: "x",
    CLOUD_ENDPOINT: "localhost", CLOUD_PORT: "9000", CLOUD_USE_SSL: "false", CLOUD_ACCESS_KEY: "x",
    CLOUD_SECRET_KEY: "x", CLOUD_BUCKET_NAME: "x", USER_FOLDER: "users",
  };
  for (const [k, v] of Object.entries(placeholders)) env[k] ??= v;

  // 2. schema + seed
  run("npx", ["prisma", "db", "push", "--skip-generate"], API_DIR, env, "prisma db push");
  const tsxCli = createRequire(path.join(API_DIR, "package.json")).resolve("tsx/cli");
  run(process.execPath, [tsxCli, path.join(WEB_DIR, "e2e/support/seed.api.ts")], API_DIR, env, "seed");

  // 3. API
  const api = spawn(process.execPath, [tsxCli, "app.ts"], { cwd: API_DIR, env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  const keep = (b: Buffer): void => {
    log = (log + b.toString()).slice(-4000);
  };
  api.stdout?.on("data", keep);
  api.stderr?.on("data", keep);
  let exited = false;
  api.once("exit", () => {
    exited = true;
  });

  const url = `http://localhost:${E2E.apiPort}/health/ready`;
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (exited) throw new Error(`API exited during start-up. Last output:\n${redact(log)}`);
    try {
      const res = await fetch(url);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      killTree(api);
      throw new Error(`API not ready after 90 s. Last output:\n${redact(log)}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return async () => {
    killTree(api);
  };
}
