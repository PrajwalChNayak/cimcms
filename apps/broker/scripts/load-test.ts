/**
 * Load test: N simulated LED controllers send full telemetry every second through the CIMCMS
 * broker into the real API, on throw-away embedded PostgreSQL databases (nothing remote).
 *
 *   npx tsx scripts/load-test.ts [devices=50] [seconds=60]
 *
 * Reports: messages sent / received by the broker / applied by the API, how far behind the
 * API is at the end, history rows written (throttled), broker stats and memory.
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import argon2 from "argon2";
import { startSimulator } from "@cimcms/device-sim";
import { PrismaClient as BrokerPrisma } from "../src/generated/prisma/index.js";
import { startBroker } from "../src/broker.js";

const DEVICES = Number(process.argv[2] ?? 50);
const SECONDS = Number(process.argv[3] ?? 60);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const apiDir = path.join(root, "apps/api");
const prismaCli = path.join(root, "node_modules/prisma/build/index.js");
const tsx = path.join(root, "node_modules/tsx/dist/cli.mjs");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const freePort = () =>
  new Promise<number>((res) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => res(p));
    });
  });

const dir = mkdtempSync(path.join(os.tmpdir(), "cimcms-load-"));
const pgPort = await freePort();
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "load", port: pgPort, persistent: false, onLog: () => undefined });
await pg.initialise();
await pg.start();
await pg.createDatabase("load_app");
await pg.createDatabase("load_broker");
const APP_DB = `postgresql://postgres:load@127.0.0.1:${pgPort}/load_app?schema=public`;
const BROKER_DB = `postgresql://postgres:load@127.0.0.1:${pgPort}/load_broker?schema=public`;
execFileSync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", path.join(apiDir, "src/models/tables/schema.prisma")], { env: { ...process.env, DATABASE_URL: APP_DB }, stdio: "ignore" });
execFileSync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", path.join(root, "apps/broker/prisma/schema.prisma")], { env: { ...process.env, BROKER_DATABASE_URL: BROKER_DB }, stdio: "ignore" });

const ids = Array.from({ length: DEVICES }, (_, i) => `LOAD-${String(i + 1).padStart(3, "0")}`);
const devicePw = "load-device-password";
const svcPw = "load-service-password";
const hash = await argon2.hash(devicePw, { type: argon2.argon2id });
const svcHash = await argon2.hash(svcPw, { type: argon2.argon2id });

const bp = new BrokerPrisma({ datasourceUrl: BROKER_DB });
await bp.mqttAccount.create({ data: { username: "cimcms-backend", passwordHash: svcHash, kind: "SERVICE", passwordSetAt: new Date() } });
await bp.mqttAccount.createMany({ data: ids.map((id) => ({ username: id, passwordHash: hash, kind: "DEVICE" as const, deviceId: id, deviceType: "LED_CONTROLLER", passwordSetAt: new Date() })) });

const { PrismaClient: AppPrisma } = await import("@prisma/client");
const ap = new AppPrisma({ datasourceUrl: APP_DB });
await ap.device.createMany({ data: ids.map((id) => ({ deviceId: id, deviceType: "LED_CONTROLLER", type: "LED_CONTROLLER", name: id })) });

process.env.BROKER_LOG = "silent";
const mqttPort = await freePort();
// All simulated devices come from 127.0.0.1: lift the per-IP cap for the test.
const broker = await startBroker({ prisma: bp, port: mqttPort, statsIntervalMs: 0, maxConnectionsPerIp: 100_000 });

const apiPort = await freePort();
const api = spawn(process.execPath, [tsx, "app.ts"], {
  cwd: apiDir,
  env: {
    ...process.env,
    NODE_ENV: "production", // no per-query logging
    PORT: String(apiPort),
    DATABASE_URL: APP_DB,
    BROKER_DATABASE_URL: BROKER_DB,
    MQTT_URL: `mqtt://127.0.0.1:${mqttPort}`,
    MQTT_USERNAME: "cimcms-backend",
    MQTT_PASSWORD: svcPw,
    MQTT_CLIENT_ID: "cimcms-load-api",
    MQTT_PROVISIONING: "broker",
    APP_BASE_URL: "http://localhost:5173",
    TELEMETRY_STORE_INTERVAL_S: process.env.TELEMETRY_STORE_INTERVAL_S ?? "10",
  },
  stdio: ["ignore", "ignore", "pipe"],
});
let apiErr = "";
api.stderr?.on("data", (b: Buffer) => (apiErr = (apiErr + b.toString()).slice(-2000)));
for (let i = 0; i < 120; i++) {
  try {
    const r = (await (await fetch(`http://127.0.0.1:${apiPort}/health/ready`)).json()) as { mqtt?: string };
    if (r.mqtt === "up") break;
  } catch {
    /* starting */
  }
  await sleep(500);
}

console.log(`Starting ${DEVICES} devices, telemetry every 1 s for ${SECONDS} s ...`);
const sims = [];
for (const id of ids) {
  sims.push(
    await startSimulator({ url: `mqtt://127.0.0.1:${mqttPort}`, deviceId: id, username: id, password: devicePw, latencyMs: 0, heartbeatS: 1 } as never),
  );
}
const t0 = Date.now();
const before = broker.stats().messagesIn;
const mem: number[] = [];
while (Date.now() - t0 < SECONDS * 1000) {
  await sleep(5000);
  mem.push(process.memoryUsage().rss);
}
const sentWindow = broker.stats().messagesIn - before;
for (const s of sims) await (s as { stop(): Promise<void> }).stop().catch(() => undefined);
const stopAt = new Date();
await sleep(3000); // let the API drain

const statuses = await ap.deviceStatus.findMany({ where: { deviceId: { in: ids } } });
const behindMs = statuses.map((s) => stopAt.getTime() - (s.lastTelemetryAt?.getTime() ?? 0));
const rows = await ap.telemetry.count({ where: { deviceId: { in: ids } } });
const st = broker.stats();

console.log("\n===== RESULT =====");
console.log(`devices: ${DEVICES}, duration: ${SECONDS} s, expected ~${DEVICES * SECONDS} telemetry messages`);
console.log(`broker received in window: ${sentWindow} msgs (${(sentWindow / SECONDS).toFixed(1)} msg/s)`);
console.log(`broker dropped: too-large=${st.droppedTooLarge} rate-limited=${st.droppedRateLimited} refused-connections=${st.refusedConnections}`);
console.log(`API applied telemetry for ${statuses.filter((s) => s.lastTelemetryAt).length}/${DEVICES} devices`);
console.log(`API behind at stop: max ${Math.max(...behindMs)} ms, avg ${Math.round(behindMs.reduce((a, b) => a + b, 0) / behindMs.length)} ms`);
console.log(`history rows written: ${rows} (throttled; unthrottled would be ~${DEVICES * SECONDS})`);
console.log(`test process RSS: max ${Math.round(Math.max(...mem) / 1e6)} MB`);
if (apiErr.trim()) console.log(`API stderr (tail): ${apiErr.trim().slice(-500)}`);

api.kill();
await broker.close();
await bp.$disconnect();
await ap.$disconnect();
await pg.stop();
rmSync(dir, { recursive: true, force: true });
process.exit(0);
