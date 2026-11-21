import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const WEB_DIR = path.resolve(here, "../..");
export const REPO_ROOT = path.resolve(WEB_DIR, "../..");
export const API_DIR = path.join(REPO_ROOT, "apps/api");
export const COMPOSE_FILE = path.join(REPO_ROOT, "infra/dev/docker-compose.yml");
const E2E_ENV_FILE = path.join(WEB_DIR, "e2e/.env.e2e");
const DEV_CREDS_FILE = path.join(REPO_ROOT, "infra/dev/.dev-credentials.local");

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

/** Creates e2e/.env.e2e with random passwords when missing. Never prints values. */
function ensureE2eEnv(): Record<string, string> {
  const current = parseEnvFile(E2E_ENV_FILE);
  const keys = ["E2E_ADMIN_PASSWORD", "E2E_VIEWER_PASSWORD", "E2E_TECH_PASSWORD"];
  const missing = keys.filter((k) => !current[k] || current[k].startsWith("<"));
  if (missing.length > 0) {
    for (const k of missing) current[k] = randomPassword();
    const body = Object.entries(current).map(([k, v]) => `${k}=${v}`).join("\n");
    writeFileSync(E2E_ENV_FILE, `${body}\n`, { mode: 0o600 });
  }
  return current;
}

const fileEnv = ensureE2eEnv();
const devCreds = parseEnvFile(DEV_CREDS_FILE);
const pick = (k: string, from: Record<string, string>): string | undefined =>
  process.env[k] || from[k] || undefined;

function required(v: string | undefined, name: string): string {
  if (!v) {
    throw new Error(
      `${name} is not set. Provide infra/dev/.dev-credentials.local (see infra/dev/mosquitto/README.md) or export it.`,
    );
  }
  return v;
}

export const E2E = {
  apiPort: Number(pick("E2E_API_PORT", fileEnv) ?? 3914),
  webPort: Number(pick("E2E_WEB_PORT", fileEnv) ?? 5273),
  dbName: pick("E2E_DB_NAME", fileEnv) ?? "cimcms_e2e",
  mainRoute: "api/v1",
  mongoHost: "localhost:27017",
  mqttUrl: "mqtt://localhost:1883",
  deviceId: "LED-01",
  users: {
    admin: { email: "e2e-admin@cimcms.test", role: "ADMIN", password: required(pick("E2E_ADMIN_PASSWORD", fileEnv), "E2E_ADMIN_PASSWORD") },
    viewer: { email: "e2e-viewer@cimcms.test", role: "VIEWER", password: required(pick("E2E_VIEWER_PASSWORD", fileEnv), "E2E_VIEWER_PASSWORD") },
    tech: { email: "e2e-tech@cimcms.test", role: "TECHNICIAN", password: required(pick("E2E_TECH_PASSWORD", fileEnv), "E2E_TECH_PASSWORD") },
  },
  /** Secrets: used to run the API/simulator and by the secret scan. Never printed. */
  mqtt: {
    backendUser: required(pick("MQTT_BACKEND_USER", devCreds), "MQTT_BACKEND_USER"),
    backendPassword: required(pick("MQTT_BACKEND_PASSWORD", devCreds), "MQTT_BACKEND_PASSWORD"),
    ledUser: required(pick("MQTT_LED01_USER", devCreds), "MQTT_LED01_USER"),
    ledPassword: required(pick("MQTT_LED01_PASSWORD", devCreds), "MQTT_LED01_PASSWORD"),
  },
} as const;

export type E2eRole = keyof typeof E2E.users;
export const baseURL = `http://localhost:${E2E.webPort}`;
export const databaseUrl = `mongodb://${E2E.mongoHost}/${E2E.dbName}?replicaSet=rs0&directConnection=true`;
