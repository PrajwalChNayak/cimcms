import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const WEB_DIR = path.resolve(here, "../..");
export const REPO_ROOT = path.resolve(WEB_DIR, "../..");
export const API_DIR = path.join(REPO_ROOT, "apps/api");
export const BROKER_DIR = path.join(REPO_ROOT, "apps/broker");
const E2E_ENV_FILE = path.join(WEB_DIR, "e2e/.env.e2e");

function parseEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const randomPassword = (): string => randomBytes(18).toString("base64url");

/**
 * Creates/extends e2e/.env.e2e (git-ignored) with random passwords when missing: the e2e users and
 * the two broker logins (API service account, LED-01 device account) that global-setup writes into
 * table MqttAccount of the scratch broker database. Never prints values.
 */
function ensureE2eEnv(): Record<string, string> {
  const current = parseEnvFile(E2E_ENV_FILE);
  const keys = [
    "E2E_ADMIN_PASSWORD",
    "E2E_VIEWER_PASSWORD",
    "E2E_TECH_PASSWORD",
    "E2E_MQTT_BACKEND_PASSWORD",
    "E2E_MQTT_LED01_PASSWORD",
  ];
  const missing = keys.filter((k) => !current[k] || current[k].startsWith("<"));
  if (missing.length > 0) {
    for (const k of missing) current[k] = randomPassword();
    const body = Object.entries(current).map(([k, v]) => `${k}=${v}`).join("\n");
    writeFileSync(E2E_ENV_FILE, `${body}\n`, { mode: 0o600 });
  }
  return current;
}

const fileEnv = ensureE2eEnv();
const pick = (k: string, from: Record<string, string>): string | undefined =>
  process.env[k] || from[k] || undefined;

function required(v: string | undefined, name: string): string {
  if (!v) {
    throw new Error(
      `${name} is not set. Delete apps/web/e2e/.env.e2e to regenerate it, or export ${name}.`,
    );
  }
  return v;
}

export const E2E = {
  apiPort: Number(pick("E2E_API_PORT", fileEnv) ?? 3914),
  webPort: Number(pick("E2E_WEB_PORT", fileEnv) ?? 5273),
  dbName: pick("E2E_DB_NAME", fileEnv) ?? "cimcms_e2e",
  /** Separate scratch database of the broker (MqttAccount, MqttRetained); also reset by global-setup. */
  brokerDbName: pick("E2E_BROKER_DB_NAME", fileEnv) ?? `${pick("E2E_DB_NAME", fileEnv) ?? "cimcms_e2e"}_broker`,
  mainRoute: "api/v1",
  /**
   * A LOCAL PostgreSQL where the e2e run may drop/create the cimcms_e2e* database (for example
   * `docker run -d -p 127.0.0.1:5433:5432 -e POSTGRES_USER=cimcms -e POSTGRES_PASSWORD=cimcms_dev_only postgres:16`).
   * The default password is a local throwaway value, not a secret.
   */
  pgHost: pick("E2E_PG_HOST", fileEnv) ?? "localhost",
  pgPort: Number(pick("E2E_PG_PORT", fileEnv) ?? 5433),
  pgUser: pick("E2E_PG_USER", fileEnv) ?? "cimcms",
  pgPassword: pick("E2E_PG_PASSWORD", fileEnv) || process.env.CIMCMS_DEV_PG_PASSWORD || "cimcms_dev_only",
  /**
   * Own broker (apps/broker) started by global-setup. It picks free ports and exports
   * E2E_BROKER_PORT / E2E_BROKER_HEALTH_PORT, which the test workers inherit.
   */
  get mqttUrl(): string {
    const port = process.env.E2E_BROKER_PORT;
    if (!port) throw new Error("E2E_BROKER_PORT is not set (the broker is started by e2e/global-setup.ts)");
    return `mqtt://localhost:${port}`;
  },
  deviceId: "LED-01",
  users: {
    admin: { email: "e2e-admin@cimcms.test", role: "ADMIN", password: required(pick("E2E_ADMIN_PASSWORD", fileEnv), "E2E_ADMIN_PASSWORD") },
    viewer: { email: "e2e-viewer@cimcms.test", role: "VIEWER", password: required(pick("E2E_VIEWER_PASSWORD", fileEnv), "E2E_VIEWER_PASSWORD") },
    tech: { email: "e2e-tech@cimcms.test", role: "TECHNICIAN", password: required(pick("E2E_TECH_PASSWORD", fileEnv), "E2E_TECH_PASSWORD") },
  },
  /**
   * Broker logins (secrets): created in MqttAccount by the seed, used to run the API/simulator and
   * by the secret scan. Never printed. Device login: username = client id = device id.
   */
  mqtt: {
    backendUser: "cimcms-backend",
    backendPassword: required(pick("E2E_MQTT_BACKEND_PASSWORD", fileEnv), "E2E_MQTT_BACKEND_PASSWORD"),
    ledUser: "LED-01",
    ledPassword: required(pick("E2E_MQTT_LED01_PASSWORD", fileEnv), "E2E_MQTT_LED01_PASSWORD"),
  },
} as const;

export type E2eRole = keyof typeof E2E.users;
export const baseURL = `http://localhost:${E2E.webPort}`;
export const databaseUrl = `postgresql://${encodeURIComponent(E2E.pgUser)}:${encodeURIComponent(E2E.pgPassword)}@${E2E.pgHost}:${E2E.pgPort}/${E2E.dbName}?schema=public`;
/** Broker database (apps/broker/prisma/schema.prisma), separate from the app database. */
export const brokerDatabaseUrl = `postgresql://${encodeURIComponent(E2E.pgUser)}:${encodeURIComponent(E2E.pgPassword)}@${E2E.pgHost}:${E2E.pgPort}/${E2E.brokerDbName}?schema=public`;
/** Maintenance database on the same server, used only to drop/create the scratch database. */
export const adminDatabaseUrl = `postgresql://${encodeURIComponent(E2E.pgUser)}:${encodeURIComponent(E2E.pgPassword)}@${E2E.pgHost}:${E2E.pgPort}/postgres?schema=public`;
