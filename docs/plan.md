# CIMCMS — Implementation Plan

**Audience:** an AI coding agent (any model size) or developer who will build the system task by task.
**Goal:** build the CIMCMS web platform (LED Controller MVP in simulation mode first) by extending the existing Cultivo IoT API and React UI.
**Date:** 21 November 2026

Source documents (read them when a task says so; this plan is the summary you act on):

| File | What it is |
| --- | --- |
| `CIMCMS_Complete_System_Architecture_FRS_AI_Deployment.md` | Master requirements (FRS). Target behaviour, acceptance criteria. |
| `CIMCMS_LED_Controller_Web_Cloud_Handover (1).md` | LED Controller handover. Hardware, MQTT proposal, security, phases. |
| `API_ARCHITECTURE.md` | How the **existing** backend is built (Express + Prisma + MongoDB). Follow its conventions. |
| `UI_ARCHITECTURE.md` | How the **existing** frontend is built (React + RTK Query + Zod). Follow its conventions. The title says "QMS"; this is a scaffold name. It is the Cultivo web app. |

---

## 0. Rules for the executing agent

Read this section before every session.

1. **Do tasks in order.** One task = one session = one commit. Do not start a task until all tasks it depends on are done.
2. **Read first.** Each task lists files to read. Read them before editing. Verify every path exists. If the real code differs from this plan, follow the real code's conventions and write the difference in `docs/PROGRESS.md` under "Deviations".
3. **Locked decisions (section 2) are final.** Do not re-decide them. If a task seems to need a different decision, stop and write the question in `docs/PROGRESS.md` under "Questions for owner".
4. **Open decisions (section 13):** use the listed default. Put `// TODO(owner-decision O-x)` at the code location.
5. **Never invent:** credentials, passwords, room names, relay-to-room mappings, device IDs other than the placeholders in this plan, hardware features, or server settings.
6. **Never put secrets in code, Git, logs, frontend bundles, or this plan.** Use `.env` files that are git-ignored. Commit only `.env.example` files with placeholder values.
7. **Never touch production systems.** No SSH to servers, no change to the live Mosquitto broker, no publish to `cimcms/humidifier/...` topics. Tasks marked **HUMAN-ONLY** are done by a person; the agent only writes the runbook.
8. **Simulation stays ON.** Never change firmware `RELAY_SIMULATION_MODE`. Never disable any of the 16 relay channels.
9. **Only approved dependencies** (section 4). Need another one? Write it under "Questions for owner" and stop.
10. **Done means checked.** Each task has a "Done when" list. Run every command in it. If a check fails, the task is not done. Never claim a feature works without a passing test.
11. **Progress file.** Keep `docs/PROGRESS.md` updated: task ID, status (todo / in progress / done), date, commit hash, deviations, questions.
12. **Commit message format:** `feat(api): T2.8 command service` (types: feat, fix, chore, test, docs, refactor). Use normal English.
13. **Code style:** follow existing ESLint + Prettier. TypeScript strict. No `any` unless the existing code forces it. No `console.log` (use the logger).
14. **Tasks that need a careful human review** before merge: T0.4, T2.3, T2.6, T2.8, T4.3. Mark the PR "needs senior review".

---

## 1. Context in short

- CIMCMS = mushroom cultivation management. Independent ESP32 controllers talk MQTT to a broker. A Node.js backend talks to the broker, stores data, and pushes live updates to a React app over WebSocket.
- **First deliverable:** LED Controller (16 relay channels) in **simulation mode**: login, see 16 logical relay states live, switch a relay ON/OFF, see pending until device acknowledgement, history and audit.
- Other modules (Humidifier, Steam Generator, Environment/Airflow) must be addable later without core changes. The Humidifier already exists on the broker and **must keep working**.
- Existing code to extend:
  - **API:** Node 20, TypeScript ESM, Express 4, Prisma 6 with MongoDB, JWT + Argon2id, RBAC (User/Role/Permission), layers routes → controllers → services → repositories, static classes, `ResponseEntity` envelope, central error handler.
  - **UI:** React + TypeScript + Vite, Redux Toolkit + RTK Query, Zod, react-hook-form, Tailwind, feature folders with barrels, lazy routes.

---

## 2. Locked decisions

| ID | Decision | Why |
| --- | --- | --- |
| D-1 | **Database stays MongoDB** (existing, via Prisma). Telemetry goes into a MongoDB **time-series collection**. No InfluxDB, no PostgreSQL in MVP. | Existing code, repositories and error handling are built on Prisma + MongoDB. Time-series collections replace the optional InfluxDB. Owner may override (O-1) before T2.1 starts. |
| D-2 | **Monorepo** `cimcms/` with npm workspaces: `apps/api`, `apps/web`, `packages/contracts`, `tools/device-sim`, `infra/`, `docs/`. | FRS asks for one repository with frontend, backend, infra and docs folders. Shared contracts need one place. |
| D-3 | **One backend process** runs HTTP API + Socket.IO + MQTT client + background jobs. Run **exactly 1 instance**. Never enable pm2 cluster mode or multiple replicas. | Multiple instances would duplicate MQTT ingestion and split socket rooms. One process is enough for a few devices. |
| D-4 | CIMCMS staff log in with the **internal `User` domain** (`POST /user/login`). The `Consumer` domain (`/auth/*`) is not changed. | Only `User` tokens carry roles and permissions. |
| D-5 | **Access token 15 min**, kept in memory in the UI. **Refresh token 7 days** in an HttpOnly, Secure, SameSite=Strict cookie, rotated on every use, stored hashed in DB. | Fixes "page reload logs out" (UI §15) and stale 30-day permission claims (API §12). |
| D-6 | **Same-origin deployment:** `https://<domain>/` = SPA, `/api/` = API, `/socket.io/` = WebSocket, all through Nginx. Dev uses the Vite proxy the same way. | Cookies and CORS stay simple and safe. |
| D-7 | **MQTT wire format is snake_case** (as in the FRS). REST, DB and UI use camelCase. `packages/contracts` holds both schemas and the mapping functions. | Firmware-friendly wire format, JS-friendly app format. |
| D-8 | **Device references:** MQTT payloads, socket rooms, and operational collections use the physical `deviceId` string (e.g. `LED-01`). REST path parameter `:id` is the MongoDB ObjectId (existing convention). Every device DTO has both `id` and `deviceId`. | Ingest needs no lookup; REST stays consistent with existing routes. |
| D-9 | **Web commands are absolute**, never toggle: `SET_RELAY {relay, state: ON/OFF}`, `SET_ALL_RELAYS {state}`. Bulk = one command, not 16. | Two users clicking at once cannot invert each other. |
| D-10 | **Command timing:** command TTL 15 s (`expires_at_utc = issued + 15 s`). Backend marks `TIMEOUT` at expiry + 5 s. Device connects with **clean session = true** (no queued commands after reconnect). Commands to a device that is not `ONLINE` are refused with 409. | The device can never run a command after the UI has shown it as failed. |
| D-11 | **MVP mode policy for relay commands:** allowed when device mode is `MANUAL`. In `MAINTENANCE` only with permission `DEVICE_DIAGNOSTICS`. In `AUTO` or `EXPERIMENT` refused with `MODE_POLICY_BLOCKED`. | Override policy is not confirmed yet (O-3, O-4). Safe default. |
| D-12 | **AUTO schedules run on the device** from a retained, versioned config message (Phase 5), not from timed backend commands. | Lighting keeps working during internet outages. |
| D-13 | **Humidifier is monitor-only:** backend subscribes to `cimcms/humidifier/+/status` (plain-text `online`/`offline` accepted). Backend never publishes to humidifier topics. | FRS: do not disrupt the Humidifier. |
| D-14 | **Mosquitto stays the existing host service.** Not put in Docker Compose. Changes only by a human using the runbook (T4.3). Add an 8883 TLS listener. Keep 1883 until the Humidifier is migrated. | Do not disrupt the existing broker. |
| D-15 | **Zod validation at every edge:** REST body/query/params, every inbound MQTT message, every socket message. | API has no validation layer today (API §12). |
| D-16 | **Tests:** Vitest in all packages, supertest for API routes, in-process `aedes` broker + `mongodb-memory-server` replica set for integration tests, Playwright for end-to-end. | Neither app has tests today. |
| D-17 | **Time:** store UTC everywhere. Display `Asia/Kolkata` (UTC+05:30, no DST) in the UI only. | FRS §5. |

---

## 3. Target architecture

```
 Browser (desktop / tablet / mobile)
        │  HTTPS + WSS (same origin)
        ▼
 ┌──────────────────────── Linux server (Docker Compose) ────────────────────────┐
 │  web  (Nginx + built React SPA)                                               │
 │    /            → SPA (index.html fallback)                                   │
 │    /api/        → api:3814/<MAIN_ROUTE>/                                      │
 │    /socket.io/  → api:3814 (WebSocket upgrade)                                │
 │        │                                                                      │
 │  api  (Node 20, ONE process)                                                  │
 │    Express routes ─ controllers ─ services ─ repositories ─ Prisma ──► mongo  │
 │    Socket.IO namespace /realtime                                              │
 │    MQTT client (clientId cimcms-backend, clean=false) ─────────┐              │
 │    Jobs: command timeout sweeper, liveness sweeper, retention  │              │
 │                                                                │              │
 │  mongo (single-node replica set rs0, private network only)     │              │
 └────────────────────────────────────────────────────────────────┼──────────────┘
                                                                  │ MQTTS 8883
                                           ┌──────────────────────▼───────────┐
                                           │ Mosquitto (existing host service)│
                                           │ 8883 TLS (new) + 1883 (legacy)   │
                                           └───────┬──────────────────┬───────┘
                                                   │ 8883             │ 1883 (until migrated)
                                          ESP32 LED Controller   ESP32 Humidifier (existing)
                                          (LED-01, simulation)   (monitor-only)
```

**Command path (must match FRS §7.2):** browser `POST /api/devices/:id/commands` → auth + permission + validation → `Command` record → MQTT publish QoS 1 → device validates and acts → device publishes `ack` + `telemetry` (+ `event`) → backend updates DB → Socket.IO pushes `command:updated` and `device:status` → UI shows result.

**Raspberry Pi:** not part of MVP. Default (O-10): devices connect directly to the cloud broker; the Pi may later provide local NTP or bridge MQTT. Topic names are designed so a Mosquitto bridge on the Pi can be added without changes.

---

## 4. Repository layout and approved dependencies

### 4.1 Layout

```
cimcms/
├── apps/
│   ├── api/                  existing Cultivo IoT API (imported with history)
│   └── web/                  existing React app (imported with history)
├── packages/
│   └── contracts/            @cimcms/contracts — Zod schemas, constants, topic helpers, DTO types,
│                             JSON Schema export, golden fixtures
├── tools/
│   └── device-sim/           @cimcms/device-sim — LED controller simulator (MQTT)
├── infra/
│   ├── dev/                  docker-compose.yml (mongo rs0 + mosquitto), mosquitto dev config
│   └── prod/                 docker-compose.yml, nginx config, mosquitto ACL template, backup scripts
├── docs/
│   ├── source/               the four source .md files (moved here)
│   ├── PROGRESS.md           task status, deviations, questions
│   └── runbooks/             deploy, mosquitto-hardening, backup-restore
├── .github/workflows/ci.yml
├── package.json              workspaces root
└── .gitignore                includes .env, .env.*, !.env.example, node_modules, dist
```

### 4.2 Approved dependencies

| Package | Runtime | Dev |
| --- | --- | --- |
| root | — | — |
| `packages/contracts` | `zod` (same major version as `apps/web` uses) | `typescript`, `tsup`, `vitest`, `zod-to-json-schema` (only if Zod major is 3; Zod 4 has `z.toJSONSchema`) |
| `apps/api` | existing + `mqtt` (5.x), `socket.io` (4.x), `cookie-parser`, `zod`, `@cimcms/contracts` | existing + `vitest`, `supertest`, `@types/supertest`, `@types/cookie-parser`, `aedes`, `mongodb-memory-server` |
| `apps/web` | existing + `socket.io-client` (4.x), `@cimcms/contracts` | existing + `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `msw`, `@playwright/test` |
| `tools/device-sim` | `mqtt` (5.x), `@cimcms/contracts` | `tsx`, `typescript`, `vitest` |

Notes:
- npm workspaces do **not** support the `workspace:*` protocol. Depend on internal packages with `"@cimcms/contracts": "*"`.
- Use Node's built-in `crypto.randomUUID()`. Do not add `uuid`.
- Do not add Redis, Kafka, InfluxDB, PostgreSQL, Kubernetes, or a job-queue library.

---

## 5. Contracts (`packages/contracts`) — implement exactly

This package is the single source of truth for every message between firmware, backend and UI. Firmware developers get the exported JSON Schemas.

### 5.1 Constants — `src/constants.ts`

```ts
export const SCHEMA_VERSION = 1 as const;
export const TOPIC_ROOT = 'cimcms' as const;
export const LED_CHANNEL_COUNT = 16 as const;
export const TIMEZONE = 'Asia/Kolkata' as const;
export const TZ_OFFSET_MINUTES = 330 as const;

export const COMMAND_TTL_MS = 15_000;            // expires_at = issued_at + TTL
export const COMMAND_TIMEOUT_GRACE_MS = 5_000;   // backend TIMEOUT at expires_at + grace
export const MAX_INFLIGHT_COMMANDS_PER_DEVICE = 4;
export const HEARTBEAT_INTERVAL_S = 30;          // device telemetry period
export const MQTT_KEEPALIVE_S = 30;
export const STALE_AFTER_MS = 75_000;            // 2.5 x heartbeat
export const MAX_MQTT_PAYLOAD_BYTES = 16_384;    // backend drops larger messages
export const MAX_CONFIG_PAYLOAD_BYTES = 4_096;   // firmware MQTT buffer must be >= this

export const DEVICE_MODES = ['MANUAL', 'MAINTENANCE', 'AUTO', 'EXPERIMENT'] as const;
export const ON_OFF = ['ON', 'OFF'] as const;
export const LIVENESS = ['UNKNOWN', 'ONLINE', 'STALE', 'OFFLINE'] as const;

export const COMMAND_ACTIONS = [
  'SET_RELAY', 'SET_ALL_RELAYS', 'REQUEST_STATUS', 'SET_MODE', 'RTC_SYNC_NOW',
] as const;
export const MVP_COMMAND_ACTIONS = ['SET_RELAY', 'SET_ALL_RELAYS', 'REQUEST_STATUS'] as const;

export const ACK_RESULTS = ['ACCEPTED', 'EXECUTED', 'REJECTED', 'EXPIRED', 'DUPLICATE', 'FAILED'] as const;

// Backend-side command status (superset of device results)
export const COMMAND_STATUSES = [
  'PENDING', 'PUBLISHED', 'ACCEPTED',
  'EXECUTED', 'REJECTED', 'EXPIRED', 'DUPLICATE', 'FAILED',
  'TIMEOUT', 'PUBLISH_FAILED',
] as const;
export const NON_TERMINAL_COMMAND_STATUSES = ['PENDING', 'PUBLISHED', 'ACCEPTED'] as const;

export const COMMAND_SOURCES = ['web', 'schedule', 'experiment', 'system'] as const;

export const DEVICE_EVENT_TYPES = [
  'BOOT', 'RELAY_CHANGED', 'MODE_CHANGED', 'KEYPAD', 'WIFI', 'MQTT',
  'RTC_SYNC', 'CONFIG_APPLIED', 'ERROR',
] as const;
// Events the backend itself records (origin BACKEND)
export const BACKEND_EVENT_TYPES = [
  'ONLINE', 'OFFLINE', 'STALE', 'SCHEMA_REJECTED', 'UNKNOWN_ACK',
] as const;

export const RELAY_CHANGE_SOURCES = ['KEYPAD', 'COMMAND', 'SCHEDULE', 'EXPERIMENT', 'BOOT', 'UNKNOWN'] as const;
```

### 5.2 Device type registry — `src/deviceTypes.ts`

Static data shared by API and UI. Handlers live in the API (T2.4).

```ts
export const DEVICE_TYPES = {
  LED_CONTROLLER: {
    topicSegment: 'led', channelCount: 16, status: 'IMPLEMENTED',
    readOnly: false, staleAfterMs: STALE_AFTER_MS,
    handles: ['status', 'telemetry', 'ack', 'event'],
    supportedActions: MVP_COMMAND_ACTIONS,           // Phase 5 adds SET_MODE, RTC_SYNC_NOW
  },
  HUMIDIFIER: {
    topicSegment: 'humidifier', channelCount: null, status: 'MONITOR_ONLY',
    readOnly: true, staleAfterMs: null,               // no known heartbeat → never marked STALE
    handles: ['status'], supportedActions: [],
  },
  STEAM_GENERATOR: {
    topicSegment: 'steam', channelCount: null, status: 'PLANNED',   // TODO(owner-decision O-16)
    readOnly: true, staleAfterMs: null, handles: [], supportedActions: [],
  },
  ENV_CONTROLLER: {
    topicSegment: 'environment', channelCount: null, status: 'PLANNED', // TODO(owner-decision O-16)
    readOnly: true, staleAfterMs: null, handles: [], supportedActions: [],
  },
} as const;
export type DeviceType = keyof typeof DEVICE_TYPES;
```

### 5.3 Topics — `src/topics.ts`

| Topic | Direction | QoS | Retain | Notes |
| --- | --- | --- | --- | --- |
| `cimcms/<segment>/<deviceId>/status` | device → backend | 1 | **yes** | JSON (LED) or plain `online`/`offline` (Humidifier). LWT = offline, retained. |
| `cimcms/<segment>/<deviceId>/telemetry` | device → backend | 0 | no | Full snapshot. On connect, on every change, every 30 s. |
| `cimcms/<segment>/<deviceId>/ack` | device → backend | 1 | no | Command results. |
| `cimcms/<segment>/<deviceId>/event` | device → backend | 1 | no | Relay changes, keypad, mode, errors. |
| `cimcms/<segment>/<deviceId>/command` | backend → device | 1 | **never** | Retaining a command would replay it. |
| `cimcms/<segment>/<deviceId>/config` | backend → device | 1 | yes | Phase 5. Desired config, versioned. |
| `cimcms/backend/status` | backend → all | 1 | yes | `{"state":"online"}`; LWT `{"state":"offline"}`. |

Functions to implement:

```ts
export type TopicKind = 'status' | 'telemetry' | 'ack' | 'event' | 'command' | 'config';
export function topicFor(type: DeviceType, deviceId: string, kind: TopicKind): string;
export function parseTopic(topic: string):
  | { type: DeviceType; deviceId: string; kind: TopicKind }
  | null;                                   // null for anything not matching the pattern
export function backendSubscriptions(opts: { monitorHumidifier: boolean }): string[];
// returns: cimcms/led/+/status, cimcms/led/+/telemetry, cimcms/led/+/ack, cimcms/led/+/event
//          + cimcms/humidifier/+/status when monitorHumidifier
```

Device ID rule: `^[A-Za-z0-9-]{3,40}$` (fits `LED-01` and `CIMCMS-4765B7A0`).

### 5.4 Wire schemas (snake_case) — `src/mqtt/*.ts`

Use syntax that works in both Zod 3 and Zod 4. Fields marked "proposal" are new; they are optional until the firmware sends them. Put the shared primitives (`isoUtc`, `deviceIdSchema`, `relayNo`, `onOff`, `mode`) in `src/mqtt/primitives.ts` and import them in each schema file.

```ts
import { z } from 'zod';
const isoUtc = z.string().datetime();                     // must end with Z
export const deviceIdSchema = z.string().regex(/^[A-Za-z0-9-]{3,40}$/);
const relayNo = z.number().int().min(1).max(LED_CHANNEL_COUNT);
const onOff = z.enum(ON_OFF);
const mode = z.enum(DEVICE_MODES);

// status.ts
export const statusWireSchema = z.object({
  schema_version: z.literal(1),
  device_id: deviceIdSchema,
  state: z.enum(['online', 'offline']),
  firmware_version: z.string().max(32).optional(),
  mode: mode.optional(),
  boot_id: z.string().max(40).optional(),                // proposal
  timestamp_utc: isoUtc.optional(),
});
/** Accepts JSON status or legacy plain text "online"/"offline". Returns null if neither. */
export function parseStatusPayload(raw: string, topicDeviceId: string):
  { state: 'online' | 'offline'; firmwareVersion?: string; mode?: Mode; bootId?: string } | null;

// telemetry.ts
export const telemetryWireSchema = z.object({
  schema_version: z.literal(1),
  device_id: deviceIdSchema,
  firmware_version: z.string().max(32),
  timestamp_utc: isoUtc,
  boot_id: z.string().max(40).optional(),                // proposal: random id per boot
  seq: z.number().int().nonnegative().optional(),        // proposal: +1 per message, resets per boot
  mode,
  mode_status: z.enum(['ACTIVE', 'NOT_CONFIGURED']).optional(), // proposal: AUTO_NOT_CONFIGURED etc.
  simulation_mode: z.boolean(),
  connectivity: z.object({
    wifi_connected: z.boolean(),
    ssid: z.string().max(32).optional(),
    ip: z.string().max(45).optional(),
    rssi_dbm: z.number().int().min(-127).max(0).optional(),
    mqtt_connected: z.boolean(),
  }),
  relay_states: z.array(z.boolean()).length(LED_CHANNEL_COUNT),
  relay_on_count: z.number().int().min(0).max(LED_CHANNEL_COUNT),
  rtc: z.object({
    available: z.boolean().optional(),
    valid: z.boolean(),
    time_utc: isoUtc.optional(),
    sync_source: z.string().max(32).optional(),
    last_sync_utc: isoUtc.optional(),
    last_sync_result: z.string().max(32).optional(),
    drift_ms: z.number().int().optional(),
    lost_power: z.boolean().optional(),
  }).optional(),
  config_version: z.number().int().nonnegative().optional(),   // Phase 5
  auto_ready: z.boolean().optional(),                           // Phase 5
});
// Do NOT add a refine for relay_on_count. Ingest recomputes it and logs a warning on mismatch.

// command.ts — discriminated union on "action"
const commandBase = {
  schema_version: z.literal(1),
  command_id: z.string().uuid(),
  device_id: deviceIdSchema,
  issued_at_utc: isoUtc,
  expires_at_utc: isoUtc,
  source: z.enum(COMMAND_SOURCES),
};
export const commandWireSchema = z.discriminatedUnion('action', [
  z.object({ ...commandBase, action: z.literal('SET_RELAY'), relay: relayNo, state: onOff }),
  z.object({ ...commandBase, action: z.literal('SET_ALL_RELAYS'), state: onOff }),
  z.object({ ...commandBase, action: z.literal('REQUEST_STATUS') }),
  z.object({ ...commandBase, action: z.literal('SET_MODE'), mode }),
  z.object({ ...commandBase, action: z.literal('RTC_SYNC_NOW') }),
]);

// ack.ts
export const ackWireSchema = z.object({
  schema_version: z.literal(1),
  command_id: z.string().uuid(),
  device_id: deviceIdSchema,
  action: z.enum(COMMAND_ACTIONS).optional(),
  result: z.enum(ACK_RESULTS),
  reason: z.string().max(64).optional(),     // e.g. INVALID_PAYLOAD, WRONG_DEVICE, MODE_POLICY, RTC_INVALID
  relay: relayNo.optional(),
  requested_state: onOff.optional(),
  reported_state: onOff.optional(),
  timestamp_utc: isoUtc,
  simulation_mode: z.boolean(),
  clock_unverified: z.boolean().optional(), // proposal: true when RTC invalid (O-5)
});

// event.ts
export const eventWireSchema = z.object({
  schema_version: z.literal(1),
  device_id: deviceIdSchema,
  timestamp_utc: isoUtc,
  boot_id: z.string().max(40).optional(),
  seq: z.number().int().nonnegative().optional(),
  type: z.enum(DEVICE_EVENT_TYPES),
  data: z.record(z.string(), z.unknown()).default({}),
});
export const relayChangedDataSchema = z.object({
  relay: relayNo,
  state: onOff,
  source: z.enum(RELAY_CHANGE_SOURCES),
  command_id: z.string().uuid().nullable().optional(),
});

// config.ts (Phase 5 — define now, use later)
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const scheduleWindow = z.object({
  days: z.array(z.number().int().min(1).max(7)).min(1),  // ISO: 1=Mon … 7=Sun
  on: hhmm,
  off: hhmm,                                              // off < on means it crosses midnight; on == off invalid
});
const channelProgram = z.object({ relay: relayNo, windows: z.array(scheduleWindow).max(8) });
export const configWireSchema = z.object({
  schema_version: z.literal(1),
  device_id: deviceIdSchema,
  config_version: z.number().int().positive(),
  issued_at_utc: isoUtc,
  timezone: z.literal('Asia/Kolkata'),
  tz_offset_minutes: z.literal(330),
  auto: z.object({
    effective_from: dateOnly,
    effective_to: dateOnly.nullable(),
    channels: z.array(channelProgram).max(LED_CHANNEL_COUNT),
  }).nullable(),
  experiment: z.object({
    experiment_id: z.string().max(40),
    starts_at_utc: isoUtc,
    ends_at_utc: isoUtc,
    channels: z.array(channelProgram).max(LED_CHANNEL_COUNT),
  }).nullable(),
});
```

### 5.5 App-side DTOs (camelCase) — `src/dto/*.ts`

Define Zod schemas **and** inferred types. UI uses them in RTK Query `transformResponse`; API uses them to shape responses.

```ts
DeviceDto        { id, deviceId, name, type: DeviceType, location?, farmId?, createdAt, updatedAt }
DeviceStateDto   { deviceId, type, liveness: Liveness, lastSeenAt: string|null, firmwareVersion: string|null,
                   bootId: string|null, mode: Mode|null, modeStatus: string|null, simulationMode: boolean|null,
                   relayStates: boolean[] /* 16 or [] */, relayOnCount: number,
                   connectivity: { wifiConnected, ssid?, ip?, rssiDbm?, mqttConnected } | null,
                   rtc: { valid, timeUtc?, syncSource?, lastSyncUtc?, lastSyncResult?, driftMs?, lostPower? } | null,
                   configVersion: number|null, autoReady: boolean|null, updatedAt: string }
DeviceListItemDto = DeviceDto & { state: DeviceStateDto | null }
CommandDto       { commandId, deviceId, action, params: Record<string, unknown>, source, status: CommandStatus,
                   reason: string|null, lateResult: string|null, issuedBy: { id, email } | null,
                   issuedAt, expiresAt, publishedAt|null, completedAt|null,
                   acks: Array<{ result, reason?, reportedState?, receivedAt, deviceTs? }>, simulation: boolean|null }
DeviceEventDto   { id, deviceId, type, origin: 'DEVICE'|'BACKEND', data, deviceTs: string|null, receivedAt }
TelemetryPointDto{ ts, mode, simulationMode, relayStates, relayOnCount, rssiDbm?, wifiConnected, mqttConnected, rtcValid? }
AuditLogDto      { id, actorId|null, actorEmail|null, actorType, action, entity, entityId|null, data, ip|null, requestId|null, at }
CurrentUserDto   { id, email, name?, roles: string[], permissions: string[] }
```

Mapping functions: `telemetryWireToState(wire, receivedAt)`, `ackWireToAckDto(...)`, `commandToWire(command)`.

### 5.6 REST request schemas — `src/rest/*.ts`

```ts
export const submitCommandBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('SET_RELAY'), relay: relayNo, state: onOff }),
  z.object({ action: z.literal('SET_ALL_RELAYS'), state: onOff }),
  z.object({ action: z.literal('REQUEST_STATUS') }),
]);  // Phase 5 adds SET_MODE and RTC_SYNC_NOW
export const idempotencyKeySchema = z.string().uuid();          // header Idempotency-Key, optional
export const timeRangeQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const objectIdParamSchema = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) });
```

### 5.7 Socket.IO contract — `src/socket.ts`

Namespace `/realtime`, path `/socket.io`. Every server→client payload uses the envelope `{ v: 1, deviceId: string, at: string /* ISO UTC */, data: T }`.

| Event | Direction | `data` |
| --- | --- | --- |
| `device:status` | server → client | `DeviceStateDto` (full snapshot; the UI's main source) |
| `device:telemetry` | server → client | `TelemetryPointDto` |
| `device:relay_state` | server → client | `{ relayStates, relayOnCount, simulationMode }` |
| `device:connectivity` | server → client | `{ liveness, lastSeenAt, connectivity }` |
| `device:event` | server → client | `DeviceEventDto` |
| `command:updated` | server → client | `CommandDto` |
| `schedule:updated` | server → client | Phase 5 |
| `experiment:updated` | server → client | Phase 5 |
| `subscribe:device` | client → server | `{ deviceId }`, ack callback `{ ok: true } \| { ok: false, error: string }` |
| `unsubscribe:device` | client → server | `{ deviceId }` |

After a successful `subscribe:device`, the server immediately emits `device:status` with the current snapshot to that socket.

### 5.8 Error codes — `src/errors.ts`

| `errorCode` | HTTP | When |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | Zod rejected body, query, params or header |
| `ACTION_NOT_SUPPORTED` | 400 | Device type does not support the action |
| `UNAUTHENTICATED` | 401 | Missing/invalid/expired token or refresh cookie |
| `FORBIDDEN` | 403 | Missing permission |
| `DEVICE_NOT_FOUND` | 404 | |
| `COMMAND_NOT_FOUND` | 404 | |
| `DEVICE_OFFLINE` | 409 | Liveness `OFFLINE` or no status yet |
| `DEVICE_STALE` | 409 | Liveness `STALE` or `UNKNOWN`, or mode unknown |
| `MODE_POLICY_BLOCKED` | 409 | D-11 |
| `IDEMPOTENCY_CONFLICT` | 409 | Same key used by another user |
| `DEVICE_BUSY` | 429 | In-flight commands ≥ 4 |
| `RATE_LIMITED` | 429 | Rate limiter |
| `MQTT_UNAVAILABLE` | 503 | Backend not connected to broker |

### 5.9 Golden fixtures and JSON Schema export

- `fixtures/valid/*.json`: one valid example per wire schema (use the FRS examples, with a real UUID).
- `fixtures/invalid/*.json`: at least 10 bad examples (15 relays, relay 17, missing `command_id`, bad timestamp, wrong `schema_version`, unknown action, retained-command-style payload with no expiry, etc.).
- `scripts/export-json-schema.ts` writes `json-schema/<name>.schema.json` for status, telemetry, command, ack, event, config. Commit the output. Firmware developers validate captured serial output against these files.

---

## 6. Data model (Prisma, MongoDB)

Rules:
- Add models to the existing `src/models/tables/schema.prisma`. Follow its existing naming and `@@map` style.
- **Do not change existing models**, except `Device.type` values for CIMCMS devices must be keys of `DEVICE_TYPES` (validated in the service, not in Prisma).
- Prisma requires MongoDB to run as a replica set. Dev and prod both use a single-node replica set `rs0`.
- Retention is done by a daily cleanup job (T2.10), not TTL indexes (Prisma `db push` manages indexes and might remove unknown ones).

```prisma
enum Liveness { UNKNOWN ONLINE STALE OFFLINE }
enum CommandStatus { PENDING PUBLISHED ACCEPTED EXECUTED REJECTED EXPIRED DUPLICATE FAILED TIMEOUT PUBLISH_FAILED }

model DeviceStatus {
  id              String    @id @default(auto()) @map("_id") @db.ObjectId
  deviceId        String    @unique
  type            String
  liveness        Liveness  @default(UNKNOWN)
  lastSeenAt      DateTime?
  lastStatusAt    DateTime?
  lastTelemetryAt DateTime?
  firmwareVersion String?
  bootId          String?
  lastSeq         Int?
  mode            String?
  modeStatus      String?
  simulationMode  Boolean?
  relayStates     Boolean[]
  relayOnCount    Int       @default(0)
  connectivity    Json?
  rtc             Json?
  configVersion   Int?
  autoReady       Boolean?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

type CommandAck {
  result        String
  reason        String?
  reportedState String?
  receivedAt    DateTime
  deviceTs      DateTime?
}

model Command {
  id             String        @id @default(auto()) @map("_id") @db.ObjectId
  commandId      String        @unique          // UUID on the wire
  idempotencyKey String        @unique          // client header value, or = commandId
  deviceId       String
  action         String
  params         Json
  source         String                         // web | schedule | experiment | system
  issuedById     String?       @db.ObjectId
  issuedByEmail  String?
  requestId      String?
  status         CommandStatus @default(PENDING)
  reason         String?
  lateResult     String?                        // device result that arrived after TIMEOUT
  issuedAt       DateTime
  expiresAt      DateTime
  publishedAt    DateTime?
  completedAt    DateTime?
  simulation     Boolean?
  acks           CommandAck[]
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@index([deviceId, issuedAt])
  @@index([status, expiresAt])
}

model DeviceEvent {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  deviceId   String
  type       String                   // DEVICE_EVENT_TYPES or BACKEND_EVENT_TYPES
  origin     String                   // DEVICE | BACKEND
  data       Json
  deviceTs   DateTime?
  receivedAt DateTime @default(now())

  @@index([deviceId, receivedAt])
  @@index([type, receivedAt])
}

model RelayStateChange {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  deviceId   String
  relay      Int
  state      Boolean
  source     String                   // RELAY_CHANGE_SOURCES
  commandId  String?
  simulation Boolean
  at         DateTime

  @@index([deviceId, relay, at])
}

model AuditLog {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  actorId    String?  @db.ObjectId
  actorEmail String?
  actorType  String                   // USER | SYSTEM
  action     String                   // LOGIN_SUCCEEDED, LOGIN_FAILED, COMMAND_SUBMITTED, ...
  entity     String
  entityId   String?
  data       Json?                    // never passwords, tokens, secrets
  ip         String?
  requestId  String?
  at         DateTime @default(now())

  @@index([at])
  @@index([actorId, at])
  @@index([entity, entityId])
}

model RefreshToken {
  id             String    @id @default(auto()) @map("_id") @db.ObjectId
  userId         String    @db.ObjectId
  tokenHash      String    @unique   // sha256 hex of the opaque cookie value
  familyId       String
  expiresAt      DateTime
  revokedAt      DateTime?
  replacedByHash String?
  userAgent      String?
  ip             String?
  createdAt      DateTime  @default(now())

  @@index([userId])
  @@index([familyId])
}
```

**Telemetry time-series collection** (not a Prisma model). Created at API startup by `src/models/init/timeseries.ts`:

```ts
// idempotent: ignore error code 48 (NamespaceExists)
await prisma.$runCommandRaw({
  create: 'telemetry',
  timeseries: { timeField: 'ts', metaField: 'meta', granularity: 'seconds' },
  expireAfterSeconds: 365 * 24 * 3600,          // TODO(owner-decision O-7)
});
```

Document shape: `{ ts, meta: { deviceId, type }, mode, simulationMode, relayStates, relayOnCount, rssiDbm, wifiConnected, mqttConnected, rtcValid, seq, bootId }`.
Pitfalls for `$runCommandRaw`:
- Dates must be MongoDB Extended JSON: `{ $date: '2026-11-20T12:00:00.000Z' }`.
- `find` returns `{ cursor: { firstBatch: [...] } }` and stops at 101 documents by default. Always pass `batchSize: limit`.

Phase 5 models (Room, RoomChannelAssignment, Schedule, ScheduleVersion, DeviceConfig, Experiment, ExperimentAssignment) are defined in their tasks.

---

## 7. RBAC

New non-system permissions (upsert in seed; if an existing `DEVICE_*` permission has the same meaning, reuse it and note the mapping in PROGRESS.md):

`DEVICE_READ`, `DEVICE_COMMAND`, `DEVICE_COMMAND_BULK`, `DEVICE_MODE_SET`, `DEVICE_DIAGNOSTICS`, `DEVICE_MANAGE`, `ROOM_READ`, `ROOM_WRITE`, `SCHEDULE_READ`, `SCHEDULE_WRITE`, `SCHEDULE_PUBLISH`, `EXPERIMENT_READ`, `EXPERIMENT_WRITE`, `EXPERIMENT_RUN`, `AUDIT_READ`, `REPORT_EXPORT`.

| Permission | ADMIN | OPERATOR | TECHNICIAN | VIEWER |
| --- | :-: | :-: | :-: | :-: |
| DEVICE_READ | ✓ | ✓ | ✓ | ✓ |
| DEVICE_COMMAND | ✓ | ✓ | ✓ | |
| DEVICE_COMMAND_BULK | ✓ | ✓ | | |
| DEVICE_MODE_SET | ✓ | ✓ | ✓ | |
| DEVICE_DIAGNOSTICS | ✓ | | ✓ | |
| DEVICE_MANAGE | ✓ | | | |
| ROOM_READ | ✓ | ✓ | ✓ | ✓ |
| ROOM_WRITE | ✓ | | | |
| SCHEDULE_READ | ✓ | ✓ | ✓ | ✓ |
| SCHEDULE_WRITE | ✓ | ✓ | | |
| SCHEDULE_PUBLISH | ✓ | ✓ | | |
| EXPERIMENT_READ | ✓ | ✓ | ✓ | ✓ |
| EXPERIMENT_WRITE | ✓ | ✓ | | |
| EXPERIMENT_RUN | ✓ | ✓ | | |
| AUDIT_READ | ✓ | ✓ | ✓ | ✓ |
| REPORT_EXPORT | ✓ | ✓ | ✓ | ✓ |
| existing USER_* / ROLE_* / PERMISSION_* | ✓ | | | |

- Existing role `SUPER_ADMIN` keeps everything and also gets all new permissions.
- With these defaults and D-11: in `MANUAL`, anyone with `DEVICE_COMMAND` (ADMIN, OPERATOR, TECHNICIAN) can send relay commands. In `MAINTENANCE`, only roles that also have `DEVICE_DIAGNOSTICS` (ADMIN, TECHNICIAN) can. An OPERATOR cannot send relay commands in `MAINTENANCE`. TODO(owner-decision O-4).
- The UI hides controls without permission, but **the server always enforces**.

---

## 8. Command lifecycle rules

```
          submit (REST)                      MQTT publish ok
 (none) ───────────────► PENDING ───────────────────────────► PUBLISHED
                            │  publish error                      │
                            ▼                                     │ ack ACCEPTED
                      PUBLISH_FAILED                              ▼
                                                              ACCEPTED
   ack EXECUTED / REJECTED / EXPIRED / DUPLICATE / FAILED  (from PENDING, PUBLISHED or ACCEPTED)
                            ──────────────► terminal status = ack result
   now > expiresAt + 5 s and still non-terminal
                            ──────────────► TIMEOUT
   ack after TIMEOUT        ──────────────► status stays TIMEOUT, lateResult = ack result
```

Rules:
1. **First terminal result wins.** Later acks are appended to `acks[]` only.
2. **Every status change is a conditional update:** `updateMany({ where: { commandId, status: { in: [allowed from-states] } }, data })`. Check `count`. This handles the race where the ack arrives before the code marks the command `PUBLISHED`.
3. The relay state shown in the UI always comes from **telemetry** (`DeviceStatus.relayStates`), never from the command. No optimistic update of relay state.
4. `SYSTEM` commands (`REQUEST_STATUS` sent by the backend itself) skip the liveness and mode checks.
5. Backend timeout sweeper runs every 2 s, but only starts 10 s after the MQTT client first connects (lets queued acks arrive after a backend restart).

---

## 9. UI safety rules (FRS acceptance #5, #9, #12)

Use these exact texts. Put them in one constants file in the UI (e.g. `features/ledControl/ledText.ts`).

| Situation | Text |
| --- | --- |
| Simulation banner (shown on every page that shows relay states when `simulationMode === true`) | `SIMULATION MODE — relays are not energised. States shown are logical (commanded) states, not lamp output.` |
| Relay label, simulation | `Logical: ON` / `Logical: OFF` |
| Relay label, hardware mode | `Relay: ON (no lamp feedback)` / `Relay: OFF` |
| Pending | `Pending — waiting for device…` |
| EXECUTED | `Done` |
| REJECTED | `Rejected: <reason>` |
| EXPIRED | `Expired before the device ran it` |
| TIMEOUT | `No reply from device` (+ if `lateResult`: `— device later reported <lateResult>`) |
| FAILED | `Device reported a failure` |
| PUBLISH_FAILED | `Could not reach the message broker` |
| DUPLICATE | `Duplicate — ignored by device` |
| Offline | `Device offline — commands disabled` |
| Stale / unknown | `No recent data from device — commands disabled` |
| Mode blocked | `Device is in <mode> mode — manual commands are disabled` |
| Bulk confirm title | `Turn ALL 16 relays <ON/OFF> on <deviceId>?` |
| Bulk confirm buttons | `Cancel` / `Turn all <ON/OFF>` |

Never use the words "lamp on", "light is on", or a lit-bulb icon for relay state. Use a switch/toggle icon.

---

## 10. Task list

Legend: **Depends** = tasks that must be done first. Every task ends by updating `docs/PROGRESS.md`.

**Execution order (follow this exactly):**
T0.1 → T0.2 → T0.3 → T1.1 → T0.4 → T0.5 → T0.6 → T0.7 → T0.8 → T0.9 → T1.2 → T1.3 → T2.1 → T2.2 → T2.3 → T2.4 → T2.5 → T2.6 → T2.7 → T2.8 → T2.9 → T2.10 → T2.11 → T3.1 → T3.2 → T3.3 → T3.4 → T3.5 → T3.6 → T3.7 → T3.8 → T4.1 → T4.2 → T4.3 → T4.4 → T4.5 → (owner decisions) → T5.1 … T5.6.
T1.1 runs early because T0.6 needs the contracts package. **MVP is complete after T4.5.**

### Phase 0 — Repository and prerequisite fixes

#### T0.1 — Create monorepo and import existing repos
- **Depends:** none. Needs from owner: API repo URL + branch, UI repo URL + branch (O-2).
- **Steps:**
  1. `git init cimcms` ; create `README.md`, `.gitignore` (node_modules, dist, coverage, `.env`, `.env.*`, `!.env.example`, `playwright-report`, `test-results`).
  2. Initial commit.
  3. `git subtree add --prefix=apps/api <API_REPO_URL> <branch>` and `git subtree add --prefix=apps/web <UI_REPO_URL> <branch>` (keeps history).
  4. Move the four source `.md` files into `docs/source/`. Copy this `plan.md` to `docs/plan.md`.
  5. Create `docs/PROGRESS.md` with a table of all task IDs (status `todo`) and empty "Deviations" and "Questions for owner" sections.
- **Done when:** `git log --oneline` shows both subtree merges; `apps/api/package.json` and `apps/web/package.json` exist; PROGRESS.md exists.
- **Do not:** copy files without history; change any app code.

#### T0.2 — npm workspaces
- **Depends:** T0.1
- **Steps:**
  1. Root `package.json`:
     ```json
     {
       "name": "cimcms",
       "private": true,
       "workspaces": ["packages/*", "apps/*", "tools/*"],
       "engines": { "node": ">=20" },
       "scripts": {
         "build:contracts": "npm run build -w @cimcms/contracts",
         "build": "npm run build:contracts && npm run build -w apps/api -w apps/web",
         "lint": "npm run lint --workspaces --if-present",
         "typecheck": "npm run build:contracts && npm run typecheck --workspaces --if-present",
         "test": "npm run build:contracts && npm run test --workspaces --if-present",
         "dev:infra": "docker compose -f infra/dev/docker-compose.yml up -d",
         "dev:api": "npm run dev -w apps/api",
         "dev:web": "npm run dev -w apps/web",
         "sim": "npm run start -w @cimcms/device-sim --"
       }
     }
     ```
  2. Delete `apps/api/package-lock.json` and `apps/web/package-lock.json`. Run `npm install` at root to create one root lockfile.
  3. Add `typecheck` script to `apps/web` if missing (`tsc --noEmit -p tsconfig.app.json` or what the project uses).
- **Done when:** `npm install`, `npm run build -w apps/api`, `npm run build -w apps/web` succeed from root. Record any pre-existing typecheck/lint errors in PROGRESS.md (do not fix unrelated ones here).

#### T0.3 — Remove committed secrets
- **Depends:** T0.1
- **Steps:**
  1. `git rm --cached apps/api/.env apps/api/.env.dev apps/api/.env.prod` (whichever exist). Keep local copies out of Git.
  2. Create `apps/api/.env.example` with every variable from API_ARCHITECTURE §10 plus the new ones below, all with placeholder values.
  3. Remove `.env` from the `COPY` line in `apps/api/Dockerfile`.
  4. Add to PROGRESS.md "Questions for owner": **"`.env` was committed to Git history. Rotate JWT_SECRET_KEY, SESSION_SECRET_KEY, DATABASE_URL credentials, CLOUD_ACCESS_KEY/CLOUD_SECRET_KEY, MAIL_PASSWORD."** (HUMAN-ONLY action.)
  5. New variables for `.env.example`:
     ```env
     APP_BASE_URL=http://localhost:5173
     ACCESS_TOKEN_TTL=15m
     REFRESH_TOKEN_TTL_DAYS=7
     REFRESH_COOKIE_NAME=cimcms_rt
     REFRESH_COOKIE_PATH=/api/user/token
     MQTT_URL=mqtt://localhost:1883
     MQTT_USERNAME=cimcms-backend
     MQTT_PASSWORD=<dev-only-value>
     MQTT_CLIENT_ID=cimcms-backend-dev
     MQTT_CA_FILE=
     MONITOR_HUMIDIFIER=true
     API_DOCS_ENABLED=true
     SEED_DEVICES=LED-01:LED_CONTROLLER:LED Controller 1
     ```
     `MQTT_CLIENT_ID` must differ between dev and prod: the broker disconnects an older client with the same id.
- **Done when:** `git ls-files | grep -E '\.env($|\.)' ` shows only `.env.example` files; Docker build still works (`docker build -f apps/api/Dockerfile apps/api` or equivalent).

#### T0.4 — API: middleware order, proxy trust, CORS, rate limits  *(needs senior review)*
- **Depends:** T0.2
- **Read first:** `apps/api/app.ts`, `apps/api/src/security/*`, API_ARCHITECTURE §3 and §7.
- **Steps:**
  1. Rewrite the middleware order in `app.ts` to:
     ```
     app.set('trust proxy', 1)                      // behind Nginx; rate limiter needs real client IP
     app.use(requestId)                              // T0.6 adds it; leave a placeholder comment here for now
     if (API_DOCS_ENABLED) app.use('/api-docs', ...) // before helmet so the docs page CSP is not broken
     app.use(helmet(...existing options...))
     app.use(cors({ origin: APP_BASE_URL, credentials: true }))
     app.use(express.json({ limit: '100kb' }))
     app.use(cookieParser())
     app.use(generalLimiter)                          // 1000 req / 10 min per IP
     app.use('/' + MAIN_ROUTE, apiRoute)
     app.all('*', notFound)
     app.use(errorHandler)
     ```
  2. **Remove** `requestInterceptorDataValidation` from the global chain. Its rule rejects `%` and `:` and would block ISO timestamps like `2026-11-20T12:00:00Z` in query strings. Zod validation (T0.6) replaces it. Keep the file; add a comment that it is unmounted and why.
  3. Change `limiter.security.ts` to export: `generalLimiter` (1000 / 10 min / IP), `loginLimiter` (10 / 15 min, key = IP + lower-cased email), `commandLimiter` (60 / 1 min, key = `req.subject.userId`, used after `authenticateToken`). Use `limit` or `max` depending on the installed `express-rate-limit` version. Rate-limit response uses errorCode `RATE_LIMITED`.
  4. Apply `loginLimiter` to `POST /user/login` and `POST /auth/login`.
- **Done when:** API starts; `curl -I http://localhost:<PORT>/<MAIN_ROUTE>/user/login` shows helmet headers (`strict-transport-security`, `x-content-type-options`); 11 quick login attempts with `curl` give 429 on the 11th. (The automated test for this is added in T0.7.)

#### T0.5 — API: fix known code gaps
- **Depends:** T0.2
- **Read first:** API_ARCHITECTURE §12 "Known gaps".
- **Steps:**
  1. `ConsumerRepository._modelName` → `'consumer'`; remove MySQL-era columns from its `_fieldMappings`, use real `Consumer` fields.
  2. `BaseRepository`: `updateById`, `deleteById`, `softDelete` take `id: string`. Remove every `as unknown as number` cast in services.
  3. `BaseRepository.db`: `private` → `protected`.
  4. `DeviceService.getDevicesByConsumerId`: put the required `consumerId` parameter first.
  5. `AuthService` and `UserService.login`: throw `AuthenticationError` instead of `Error` for bad credentials.
  6. Replace leftover `console.log` with the winston logger (or delete).
  7. Winston: in `NODE_ENV=production` use JSON format. Add a redaction format that replaces values of keys matching `/password|token|authorization|secret|cookie/i` with `"[REDACTED]"` at any depth.
- **Done when:** `npm run typecheck -w apps/api` passes with zero errors; `npm run lint -w apps/api` has no new errors; existing endpoints still respond (manual smoke: login, list farms).

#### T0.6 — API: request ID and Zod validation middleware
- **Depends:** T0.4, T1.1 (contracts available) — if T1.1 is not done yet, do T1.1 first.
- **Create:**
  - `src/middleware/requestid.middleware.ts`: use incoming `X-Request-Id` if it matches `^[A-Za-z0-9-]{8,64}$`, else `crypto.randomUUID()`. Set `req.requestId` (extend `src/types/express.d.ts`) and response header `X-Request-Id`. Add `requestId` to every log line in the error handler.
  - `src/middleware/validate.middleware.ts`: `validate({ body?, query?, params?, headers? })` takes Zod schemas, parses, replaces `req.body`/`req.query`/`req.params` with parsed values (for `req.query` in Express 4 assign via `Object.defineProperty` if needed), and on failure throws `ValidationError` with errorCode `VALIDATION_FAILED` and the Zod issue list in `details`.
  - Error responses include `requestId` and `errorCode`.
- **Done when:** unit tests: invalid body → 400 `VALIDATION_FAILED`; header `X-Request-Id` echoed; generated when absent.

#### T0.7 — API: test setup
- **Depends:** T0.2
- **Steps:**
  1. Add Vitest config (`vitest.config.ts`) with the same path aliases as `tsconfig.json`.
  2. `test/setup/mongo.ts`: start `MongoMemoryReplSet.create({ replSet: { count: 1 } })`, set `process.env.DATABASE_URL` **before** Prisma client is imported, run `npx prisma db push --skip-generate --schema src/models/tables/schema.prisma` in global setup.
  3. `test/setup/broker.ts`: start an in-process `aedes` broker on a random port (follow the installed aedes version README for its API).
  4. `test/helpers/auth.ts`: create a user with given role and return an access token.
  5. Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.
  6. First tests: login success, login wrong password → 401 (proves T0.5 step 5), rate limit (T0.4).
- **Done when:** `npm test -w apps/api` passes locally and runs without Docker.

#### T0.8 — Web: test setup
- **Depends:** T0.2
- **Steps:** Vitest with `jsdom`, `@testing-library/jest-dom` setup file, MSW server for API mocks, path aliases from `vite.config.ts`. One smoke test renders `LoginPage`. Script `"test": "vitest run"`.
- **Done when:** `npm test -w apps/web` passes.

#### T0.9 — CI
- **Depends:** T0.7, T0.8
- **Create** `.github/workflows/ci.yml`: on push and pull_request; Node 20; `npm ci`; `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`. Cache npm. (If the repo is not on GitHub, write the same steps for the actual CI and note it.)
- **Done when:** the workflow runs green on the remote. If there is no remote yet: the same steps (`npm ci && npm run lint && npm run typecheck && npm test && npm run build`) pass locally, and PROGRESS.md notes that CI is not yet verified on a remote.

### Phase 1 — Contracts, dev infrastructure, simulator

#### T1.1 — `packages/contracts`
- **Depends:** T0.2
- **Steps:**
  1. Check `apps/web/package.json` Zod major version. Use the same.
  2. `package.json`: name `@cimcms/contracts`, `"type": "module"`, `"main": "dist/index.js"`, `"types": "dist/index.d.ts"`, `"exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } }`, scripts `build` (`tsup src/index.ts --format esm --dts --clean`), `test`, `typecheck`, `export:schema`.
  3. Implement everything in section 5 (constants, deviceTypes, topics, mqtt schemas, dto, rest, socket, errors, mapping functions). Barrel `src/index.ts`.
  4. Fixtures (5.9) and JSON Schema export; commit `json-schema/`.
  5. Tests: every valid fixture parses; every invalid fixture fails; `parseTopic` round-trips `topicFor`; `parseTopic('cimcms/led/LED-01/telemetry/extra')` → null; `parseStatusPayload('offline', 'X')` works; `telemetryWireToState` maps all fields.
- **Done when:** `npm run build -w @cimcms/contracts && npm test -w @cimcms/contracts` pass; `json-schema/*.schema.json` exist (6 files).

#### T1.2 — Dev infrastructure (Docker Compose)
- **Depends:** T0.2
- **Create `infra/dev/docker-compose.yml`:**
  - `mongo`: image `mongo:7`, command `["--replSet","rs0","--bind_ip_all"]`, port `27017:27017`, volume `mongo-dev-data`, healthcheck:
    `mongosh --quiet --eval "try{rs.status().ok}catch(e){rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]}).ok}"` (interval 5s, retries 20).
  - `mosquitto`: image `eclipse-mosquitto:2`, port `1883:1883`, mounts `./mosquitto/mosquitto.conf`, `./mosquitto/acl`, `./mosquitto/passwd`.
- `infra/dev/mosquitto/mosquitto.conf`: `listener 1883`, `allow_anonymous false`, `password_file /mosquitto/config/passwd`, `acl_file /mosquitto/config/acl`, `persistence true`, `persistence_location /mosquitto/data/`.
- `infra/dev/mosquitto/acl`: same content as the prod template in T4.3 **minus** the `mqttuser` block.
- `infra/dev/mosquitto/README.md`: how to create the dev passwd file:
  `docker compose -f infra/dev/docker-compose.yml run --rm mosquitto mosquitto_passwd -b -c /mosquitto/config/passwd cimcms-backend <dev-pass>` then `... -b /mosquitto/config/passwd LED-01 <dev-pass>`. The passwd file is git-ignored.
- Dev `DATABASE_URL`: `mongodb://localhost:27017/cimcms?replicaSet=rs0&directConnection=true`.
- **Done when:** `npm run dev:infra` → both containers healthy; `mosquitto_sub` with backend creds can subscribe to `cimcms/led/+/telemetry`; LED-01 creds **cannot** publish to `cimcms/led/LED-02/telemetry` (ACL works).

#### T1.3 — Device simulator `tools/device-sim`
- **Depends:** T1.1, T1.2
- **CLI:** `npm run sim -- --url mqtt://localhost:1883 --device LED-01 --username LED-01 --password-env SIM_PASSWORD [--latency 200] [--fail-rate 0] [--mode MANUAL] [--heartbeat 30] [--ignore-commands] [--reject-all <REASON>] [--hardware] [--interactive]`
  Password is read from the env var named in `--password-env`, never from argv.
- **Also export** `startSimulator(options): Promise<{ stop(), crash(), state }>` for integration tests (`crash()` ends the socket without DISCONNECT so the broker fires LWT).
- **Behaviour (this is also the firmware behaviour spec):**
  1. Connect: `clientId = deviceId`, `clean: true`, `keepalive: 30`, will = status topic, JSON `{schema_version:1, device_id, state:'offline'}`, QoS 1, retain true.
  2. On connect: publish status `online` (retained, includes `firmware_version: 'sim-0.1.0'`, `mode`, `boot_id`); publish `BOOT` event; publish telemetry. New random `boot_id` per start; `seq` starts at 0 and increments for every telemetry/event.
  3. Subscribe `command` and `config` topics at QoS 1.
  4. Telemetry every `heartbeat` seconds and after every state change. `simulation_mode: true` unless `--hardware`.
  5. On command message, in this order:
     - not JSON or schema fails → if a `command_id` UUID can be read, ack `REJECTED` reason `INVALID_PAYLOAD`; else drop.
     - `device_id` ≠ own → `REJECTED` `WRONG_DEVICE`.
     - `command_id` in the last 32 seen → `DUPLICATE`.
     - now > `expires_at_utc` → `EXPIRED`.
     - `--ignore-commands` → do nothing. `--reject-all R` → `REJECTED` reason R.
     - `SET_RELAY`/`SET_ALL_RELAYS` when mode is `AUTO` or `EXPERIMENT` → `REJECTED` `MODE_POLICY`.
     - random < `fail-rate` → `FAILED`.
     - else wait `latency` ms, apply, ack `EXECUTED` (with `relay`, `requested_state`, `reported_state` for SET_RELAY), publish one `RELAY_CHANGED` event per changed relay (`source: 'COMMAND'`, `command_id`), then telemetry.
     - `REQUEST_STATUS` → telemetry + ack `EXECUTED`. `SET_MODE` → `MODE_CHANGED` event + ack `EXECUTED` + telemetry. `RTC_SYNC_NOW` → ack `ACCEPTED`, then `RTC_SYNC` event, then ack `EXECUTED`.
  6. `--interactive` stdin commands: `toggle <n>` (keypad toggle, event source `KEYPAD`), `all on`, `all off`, `mode <MODE>`, `crash`, `reboot` (crash + reconnect with new boot_id), `quit`.
  7. Every outgoing payload is validated with the contracts schema before publish (throws in dev if invalid).
- **Tests:** with in-process aedes: command → EXECUTED ack + telemetry; expired → EXPIRED; duplicate id → DUPLICATE; mode AUTO → REJECTED MODE_POLICY; `crash()` → retained offline status visible to a subscriber.
- **Done when:** tests pass; manual run against dev broker shows telemetry with `mosquitto_sub -t 'cimcms/led/LED-01/#' -v`.

### Phase 2 — Backend core

#### T2.1 — Prisma models and time-series init
- **Depends:** T0.5, T1.2. Blocked if owner chose PostgreSQL in O-1 (then stop and ask for a re-plan of this task).
- **Steps:** add the models from section 6; `npm run db:push -w apps/api` against dev Mongo; create `src/models/init/timeseries.ts` and call it during bootstrap before MQTT connects; create repositories: `DeviceStatusRepository`, `CommandRepository`, `DeviceEventRepository`, `RelayStateChangeRepository`, `AuditLogRepository`, `RefreshTokenRepository` (extend `BaseRepository`, set `_modelName` camelCase delegate key, `_defaultWhere = {}` because these models have no `status: CommonStatus`), and `TelemetryRepository` (does **not** extend BaseRepository; uses `$runCommandRaw` with `insert` and `find` as described in section 6).
- **Done when:** `db:push` succeeds; integration test inserts and reads back 3 telemetry points in time order with `batchSize`; API boot twice in a row does not fail on the existing time-series collection.

#### T2.2 — RBAC and device seed
- **Depends:** T2.1
- **Steps:**
  1. Extend `src/models/seed.ts` (idempotent upserts) with permissions and roles from section 7.
  2. Seed devices from env `SEED_DEVICES` (comma list of `deviceId:TYPE:Name`). Validate TYPE ∈ `DEVICE_TYPES`. Upsert by `deviceId`. Do not set `consumerId`/`farmId`.
  3. New script `npm run seed:admin -w apps/api -- --email <email>`: creates or updates a `User` with role `ADMIN`, password from env `BOOTSTRAP_ADMIN_PASSWORD` (refuse to run if missing or shorter than 12 chars). Never print the password.
- **Done when:** running seed twice gives the same counts; test asserts VIEWER has exactly the permissions in the matrix.

#### T2.3 — Auth: short access token, refresh cookie, /user/me  *(needs senior review)*
- **Depends:** T2.1, T0.6
- **Read first:** `src/services/user.service.ts`, `src/controllers/user.controller.ts`, `src/middleware/auth.middleware.ts`, UI_ARCHITECTURE §7.
- **Steps:**
  1. `UserService.login(email, password, meta)` → validates, builds claims `{ userId, email, roles, permissions, typ: 'access' }`, signs with `expiresIn: ACCESS_TOKEN_TTL`, creates refresh token: 32 random bytes base64url, store sha256 hex in `RefreshToken` with new `familyId`, `expiresAt = now + REFRESH_TOKEN_TTL_DAYS`. Returns `{ accessToken, refreshToken, user: CurrentUserDto }`.
  2. Controller sets cookie `REFRESH_COOKIE_NAME`: `httpOnly: true`, `secure: NODE_ENV==='production'`, `sameSite: 'strict'`, `path: REFRESH_COOKIE_PATH`, `maxAge`. Response body: `{ accessToken, user }` (refresh token never in body).
  3. `POST /user/token/refresh`: read cookie → hash → find. Missing/expired → 401. Already revoked → revoke whole family, audit `REFRESH_TOKEN_REUSE`, 401. Else revoke old (`replacedByHash`), issue new pair in same family, **reload roles and permissions from DB**, set cookie, return `{ accessToken, user }`.
  4. `POST /user/token/logout`: revoke current refresh token, clear cookie, 200. (It must live under `/user/token/` because the browser only sends the cookie to paths under `REFRESH_COOKIE_PATH`.)
  5. `GET /user/me` (authenticateToken): return `CurrentUserDto` from DB.
  6. In production, refresh and logout require `Origin` header equal to `APP_BASE_URL`, else 403.
  7. `authenticateToken`: reject tokens with `typ` other than `'access'` when `typ` is present (keeps old consumer tokens working).
  8. Audit `LOGIN_SUCCEEDED`, `LOGIN_FAILED` (email only), `LOGOUT`, `REFRESH_TOKEN_REUSE`.
  9. Leave existing consumer `/auth/*` routes unchanged.
- **Tests:** login sets cookie with HttpOnly + SameSite=Strict + path; refresh rotates (old cookie then fails and kills family); role change in DB is visible after refresh; logout clears; `/user/me` without token → 401.
- **Done when:** tests pass.

#### T2.4 — Device driver registry (API side)
- **Depends:** T1.1
- **Create** `src/drivers/driver.registry.ts`: for each `DEVICE_TYPES` entry, expose `{ ...static data, subscriptions: string[] }`. Functions: `getDriver(type)`, `supportsAction(type, action)`, `allSubscriptions({ monitorHumidifier })`. PLANNED types return no subscriptions. Unknown type → throw.
- **Done when:** unit tests: LED supports `SET_RELAY`; HUMIDIFIER supports nothing; subscriptions equal `backendSubscriptions()` from contracts.

#### T2.5 — MQTT client and dispatcher
- **Depends:** T2.4
- **Create:**
  - `src/mqtt/mqtt.client.ts` (static class `MqttClient`): `connect()` with mqtt.js 5: `mqtt.connect(MQTT_URL, { clientId: MQTT_CLIENT_ID, username, password, clean: false, keepalive: MQTT_KEEPALIVE_S, reconnectPeriod: 2000, protocolVersion: 4, ca: MQTT_CA_FILE ? fs.readFileSync(...) : undefined, rejectUnauthorized: true, will: { topic: 'cimcms/backend/status', payload: '{"state":"offline"}', qos: 1, retain: true } })`. On `connect`: subscribe to `allSubscriptions()` at QoS 1, publish backend online retained, record `firstConnectedAt`. Expose `isConnected()`, `publish(topic, payload, { qos, retain }): Promise<void>`, `onMessage(handler)`. Log connect/disconnect/error (no credentials).
  - `src/mqtt/mqtt.dispatcher.ts`: for each message: drop if payload > `MAX_MQTT_PAYLOAD_BYTES`; `parseTopic` (null → debug log, drop); device must exist in `Device` collection (cache `deviceId → type` for 60 s), else warn `UNREGISTERED_DEVICE` (rate-limit this log to once per device per 10 min) and drop; driver must handle this kind; call `IngestService.handle(kind, deviceId, type, rawString, { retained: packet.retain })`. Wrap handler in try/catch so one bad message never stops the client.
  - Graceful shutdown: on SIGINT/SIGTERM publish backend offline (retained) and `end()` before Prisma disconnect.
- **Done when:** integration test with aedes: message on `cimcms/led/LED-01/telemetry` reaches a stub ingest; message for unregistered device is dropped; oversized payload dropped.

#### T2.6 — Ingest service and device state  *(needs senior review)*
- **Depends:** T2.5, T2.1
- **Create** `src/services/ingest.service.ts` and `src/services/devicestate.service.ts`. Rules:
  - **Common:** JSON parse failure or schema failure → `DeviceEvent { type: 'SCHEMA_REJECTED', origin: 'BACKEND', data: { kind, issues (first 5), sample: first 200 chars } }`, then return. `payload.device_id` must equal the topic device id, else same rejection. Any **valid** message from a device sets `lastSeenAt = now (server time)` and liveness `ONLINE` (unless the message itself is status `offline`).
  - **status:** use `parseStatusPayload`. `offline` → liveness `OFFLINE`. `online` and `retained === true` → liveness `UNKNOWN` (unless already `ONLINE`) and, if the driver supports commands, call `CommandService.submitSystem(deviceId, 'REQUEST_STATUS')`. `online` and not retained → `ONLINE`. Update `firmwareVersion`, `mode`, `bootId`, `lastStatusAt` when present.
  - **telemetry:**
    1. Read current `DeviceStatus`.
    2. Out-of-order guard: if `boot_id` equals stored `bootId` and `seq` and stored `lastSeq` exist and `seq <= lastSeq` → insert time-series point only; do not update the snapshot.
    3. Recompute `relayOnCount` from `relay_states`; warn if it differs from `relay_on_count`.
    4. Relay diff vs stored `relayStates` (skip if stored is empty = first telemetry). For each changed relay insert `RelayStateChange` with source: `BOOT` if `boot_id` changed; else `COMMAND` (+commandId) if a Command for this device has an `EXECUTED` ack within the last 10 s whose action/relay/state matches; else `KEYPAD`/`SCHEDULE`/`EXPERIMENT` if a `RELAY_CHANGED` event for that relay+state arrived in the last 10 s; else `UNKNOWN`. **Telemetry diff is the only writer of RelayStateChange** (events never write it — avoids duplicates).
    5. Upsert `DeviceStatus` with all mapped fields, `lastTelemetryAt`, `lastSeq`, `bootId`.
    6. Insert time-series point.
    7. Emit `device:telemetry`, `device:relay_state` (only if relays changed), `device:status`.
  - **event:** insert `DeviceEvent { origin: 'DEVICE' }`. `MODE_CHANGED` → update `DeviceStatus.mode` from `data.mode` and emit `device:status`. Emit `device:event`.
  - **ack:** validate, then `CommandService.onAck(wire)`.
  - **Liveness changes** (any → different value) insert a backend `DeviceEvent` (`ONLINE`, `OFFLINE`, `STALE`) and emit `device:connectivity` + `device:status`. Write events only on change, not on every message.
  - All socket emits go through `RealtimeEmitter` (T2.7). Until T2.7 exists, use an interface with a no-op implementation.
- **Tests (integration with aedes + simulator):** telemetry creates DeviceStatus with 16 states; keypad toggle in sim creates one RelayStateChange (source KEYPAD or UNKNOWN); retained online after backend restart → UNKNOWN then ONLINE after REQUEST_STATUS reply; sim `crash()` → OFFLINE + one OFFLINE event; invalid telemetry (15 relays) → SCHEMA_REJECTED and snapshot unchanged; out-of-order seq ignored for snapshot.
- **Done when:** tests pass.

#### T2.7 — Realtime gateway (Socket.IO)
- **Depends:** T2.6
- **Steps:**
  1. Change bootstrap: `const server = http.createServer(app); attachRealtime(server); server.listen(PORT)`.
  2. `src/realtime/socket.server.ts`: `new Server(server, { path: '/socket.io', cors: { origin: APP_BASE_URL, credentials: true } })`, namespace `/realtime`.
  3. Auth middleware: token from `socket.handshake.auth.token`; verify JWT; require permission `DEVICE_READ`; store subject in `socket.data`; schedule `socket.disconnect(true)` at token `exp` (client reconnects with a fresh token).
  4. `subscribe:device`: validate `{ deviceId }` with `deviceIdSchema`; device must exist; join room `device:<deviceId>`; emit current `device:status` snapshot to this socket; ack `{ ok: true }`. Errors → ack `{ ok: false, error }`.
  5. `unsubscribe:device`: leave room.
  6. `src/realtime/realtime.emitter.ts` (static): `deviceStatus(deviceId, dto)`, `telemetry(...)`, `relayState(...)`, `connectivity(...)`, `deviceEvent(...)`, `commandUpdated(dto)`. Each emits to room `device:<deviceId>` with the envelope from 5.7.
  7. Replace the no-op emitter from T2.6.
- **Tests:** `socket.io-client` in test: no token → `connect_error`; VIEWER token → subscribe ok and receives snapshot; telemetry from sim → client receives `device:status` within 2 s.
- **Done when:** tests pass.

#### T2.8 — Command service, routes, timeout job  *(needs senior review)*
- **Depends:** T2.7, T2.2
- **Create** `src/services/command.service.ts`, `src/controllers/command.controller.ts`, routes in `device.routes.ts` and new `command.routes.ts`.
- **`submit(subject, deviceObjectId, body, idempotencyKey?, meta)`** — in this order:
  1. If `idempotencyKey`: find Command by it. Found and `issuedById === subject.userId` → return it (HTTP 200). Found, other user → 409 `IDEMPOTENCY_CONFLICT`.
  2. Load Device by ObjectId → 404 `DEVICE_NOT_FOUND`. `supportsAction(type, action)` else 400 `ACTION_NOT_SUPPORTED`.
  3. `SET_ALL_RELAYS` requires `DEVICE_COMMAND_BULK` → 403.
  4. Load DeviceStatus. None or `OFFLINE` → 409 `DEVICE_OFFLINE`. `STALE`/`UNKNOWN` → 409 `DEVICE_STALE`.
  5. Mode policy (D-11) for `SET_RELAY`/`SET_ALL_RELAYS`: `MANUAL` ok; `MAINTENANCE` needs `DEVICE_DIAGNOSTICS`; `AUTO`/`EXPERIMENT` → 409 `MODE_POLICY_BLOCKED`; mode null → 409 `DEVICE_STALE`.
  6. Count non-terminal commands for the device ≥ 4 → 429 `DEVICE_BUSY`.
  7. `MqttClient.isConnected()` false → 503 `MQTT_UNAVAILABLE`.
  8. Create Command: `commandId = randomUUID()`, `idempotencyKey = key ?? commandId`, `status PENDING`, `issuedAt = now`, `expiresAt = now + COMMAND_TTL_MS`, `source 'web'`, issuer, `requestId`.
  9. Build wire with `commandToWire`; validate with `commandWireSchema`.
  10. Publish to `topicFor(type, deviceId, 'command')`, QoS 1, **retain false**. Error → conditional update to `PUBLISH_FAILED` + `completedAt`. Success → conditional update `PENDING → PUBLISHED` + `publishedAt` (if count is 0, an ack already moved it — that is fine).
  11. Audit `COMMAND_SUBMITTED` (`data`: action, params, result status). Emit `command:updated`. Return 202 with `CommandDto` (re-read from DB).
- **`submitSystem(deviceId, action)`:** same as above from step 7, `source 'system'`, no issuer, no liveness/mode checks, no audit.
- **`onAck(wire)`:** find by `command_id` (none → backend DeviceEvent `UNKNOWN_ACK`); device id must match; push to `acks`; `ACCEPTED` → conditional `PENDING|PUBLISHED → ACCEPTED`; terminal results → conditional `PENDING|PUBLISHED|ACCEPTED → result` with `reason`, `completedAt`, `simulation`; if that updated 0 rows and current status is `TIMEOUT` → set `lateResult`. Emit `command:updated`.
- **Timeout job** `src/jobs/commandTimeout.job.ts`: every 2 s, only when `now - MqttClient.firstConnectedAt > 10 s`: find non-terminal commands with `expiresAt < now - COMMAND_TIMEOUT_GRACE_MS`, conditional update to `TIMEOUT` + `completedAt`, emit each.
- **Routes** (all `authenticateToken` + `requirePermission` + `validate`):

  | Method | Path | Permission | Notes |
  | --- | --- | --- | --- |
  | POST | `/devices/:id/commands` | DEVICE_COMMAND (+ BULK in service) | `commandLimiter`; header `Idempotency-Key` optional UUID |
  | GET | `/devices/:id/commands` | DEVICE_READ | `pageQuerySchema` + optional `status`; newest first |
  | GET | `/commands/:commandId` | DEVICE_READ | |

  Register `/devices/:id/...` sub-routes so they do not collide with existing `/devices/consumer` and `/devices/:id`.
- **Tests (integration with sim):** happy path → 202 then `EXECUTED` within 2 s and socket `command:updated` received; viewer → 403; device offline → 409 `DEVICE_OFFLINE`; sim mode AUTO → 409 `MODE_POLICY_BLOCKED` (backend check); sim `--ignore-commands` → `TIMEOUT` after ~20 s (use fake timers or short TTL via test config); sim `--reject-all INVALID_RELAY` → `REJECTED`; same Idempotency-Key twice → one command; TECHNICIAN sends SET_ALL_RELAYS → 403 (no BULK permission); broker down → 503; ack before PUBLISHED update still ends `EXECUTED`; late ack after TIMEOUT sets `lateResult`.
- **Done when:** all tests pass.

#### T2.9 — Device read endpoints
- **Depends:** T2.6

  | Method | Path | Permission | Returns |
  | --- | --- | --- | --- |
  | GET | `/devices` | DEVICE_READ | paginated `DeviceListItemDto[]` (filter by `type`; only types in `DEVICE_TYPES`) |
  | GET | `/devices/:id/state` | DEVICE_READ | `DeviceStateDto`. Device exists but never seen → 200 with empty snapshot (liveness `UNKNOWN`, `relayStates: []`). Device does not exist → 404 `DEVICE_NOT_FOUND`. |
  | GET | `/devices/:id/telemetry` | DEVICE_READ | `TelemetryPointDto[]`, `timeRangeQuerySchema`, default last 24 h, newest first |
  | GET | `/devices/:id/events` | DEVICE_READ | paginated `DeviceEventDto[]`, optional `type`, `from`, `to` |
  | GET | `/devices/:id/relay-changes` | DEVICE_READ | paginated, optional `relay`, `from`, `to` |
  | GET | `/audit` | AUDIT_READ | paginated `AuditLogDto[]`, optional `actorId`, `action`, `entity`, `from`, `to` |

- Use the existing response helpers and envelope. All dates ISO UTC strings.
- **Done when:** supertest tests for each route (permission, validation, shape parsed by the contracts DTO schema).

#### T2.10 — Health, liveness job, retention job
- **Depends:** T2.6
- **Create:**
  - `GET /health/live` → 200 `{ status: 'ok' }`. `GET /health/ready` → checks `prisma.$runCommandRaw({ ping: 1 })` and `MqttClient.isConnected()`; 200 or 503 with `{ mongo, mqtt }`. Mount at root (outside `MAIN_ROUTE`), not rate-limited, not authenticated, no secrets in output.
  - `src/jobs/liveness.job.ts`: every 10 s, for devices whose driver `staleAfterMs` is not null: `ONLINE` and `lastSeenAt < now - staleAfterMs` → `STALE` (event + emit).
  - `src/jobs/retention.job.ts`: daily at 02:00 Asia/Kolkata (use `setTimeout` to next run, no cron library): delete `DeviceEvent` and `RelayStateChange` older than 365 days, `RefreshToken` expired more than 1 day ago. Never delete `Command` or `AuditLog`. TODO(owner-decision O-7).
  - `src/jobs/index.ts` starts all jobs after MQTT connect; stops them on shutdown.
- **Done when:** tests with fake timers: device goes STALE after 75 s with no messages; humidifier never goes STALE; ready returns 503 when broker stopped.

#### T2.11 — Backend end-to-end test
- **Depends:** T2.8, T2.9, T2.10
- **Create** `apps/api/test/e2e/led-flow.test.ts`: aedes + memory replica set + API + simulator. Flow: admin login → `GET /devices` shows LED-01 → socket subscribe → `POST` SET_RELAY 2 ON → socket `command:updated` PUBLISHED then EXECUTED → socket `device:status` with relay 2 true and `simulationMode: true` → `GET /devices/:id/commands` shows the command with issuer email → `GET /audit` shows `COMMAND_SUBMITTED` → `GET /devices/:id/relay-changes` shows relay 2 source COMMAND.
- **Done when:** test passes in CI.

### Phase 3 — Frontend MVP

General rules for every UI task: follow UI_ARCHITECTURE §11 (types → schemas → baseApi tag → api → slice → hook → component → barrel → routes). Components are views only; logic in hooks. Use contracts DTO schemas in `transformResponse` via `parseResponse(apiResponseSchema(dtoSchema), raw, 'label')`.

#### T3.1 — Auth: internal user login + refresh flow
- **Depends:** T2.3, T0.8
- **Steps:**
  1. `authApi`: `login` → `POST /user/login`; `refresh` → `POST /user/token/refresh` (`credentials: 'include'`); `logout` → `POST /user/token/logout`; `me` → `GET /user/me`.
  2. `authSlice` stores `accessToken` and `user: CurrentUserDto` in memory (persist whitelist stays `['ui']`).
  3. `AppInitializer`: on boot call `refresh`; success → store token + user; failure → unauthenticated (show login). Show splash meanwhile.
  4. `baseApi`: `credentials: 'include'`; on 401 (except for the refresh call itself) run **one** shared refresh (a module-level promise so parallel 401s wait for the same refresh), then retry once; refresh failure → dispatch `{ type: 'auth/logout' }`.
  5. Vite dev proxy: `/api` → `http://localhost:<API_PORT>/<MAIN_ROUTE>` (rewrite), `/socket.io` → `http://localhost:<API_PORT>` with `ws: true`. Set `VITE_API_BASE_URL=/api` in `.env.example`.
  6. `usePermission(name)` and `useHasAnyPermission(...)` hooks reading `state.auth.user.permissions`. Enable `route.permissions` enforcement in `RoleGuard` (UI §15 item).
- **Tests (MSW):** reload keeps session (refresh succeeds); two parallel 401s trigger exactly one refresh call; refresh failure → login page.
- **Done when:** tests pass; manual: login, hard reload, still logged in.

#### T3.2 — Realtime client
- **Depends:** T2.7, T3.1
- **Create** `src/shared/realtime/socketClient.ts` (no feature imports; read token with a `RootState`-typed `getState`, like `baseApi`):
  - `connectRealtime(store)`: `io('/realtime', { path: import.meta.env.VITE_SOCKET_PATH ?? '/socket.io', auth: (cb) => cb({ token: currentToken() }), transports: ['websocket'] })`. Connect after login; disconnect on logout.
  - On `connect_error` with auth failure, or on `disconnect` with reason `'io server disconnect'` (the server closes the socket when the access token expires): trigger the shared refresh (export a hook point from baseApi or dispatch an action), then call `socket.connect()`. The Socket.IO client does **not** reconnect by itself after a server-initiated disconnect.
  - `subscribeDevice(deviceId)`: reference counted; sends `subscribe:device` only on first subscriber; re-sends all active subscriptions on every reconnect. Returns an unsubscribe function.
  - `onRealtime(event, handler)`: typed with contracts socket types; returns off function.
  - `useRealtimeConnection()` hook → `'connected' | 'connecting' | 'disconnected'`; show a small indicator in the `DashboardLayout` header.
- **Done when:** unit tests with a mocked socket: ref counting; resubscribe on reconnect.

#### T3.3 — Devices feature on real API with live state
- **Depends:** T3.2, T2.9
- **Steps:**
  1. Replace mock seed data in `features/devices` with `deviceApi` queries (UI §15 says endpoints exist but screens use mocks). Keep mocks only for tests.
  2. Endpoints: `listDevices`, `getDeviceState`, `getDeviceTelemetry`, `getDeviceEvents`, `getDeviceCommands`, `getRelayChanges`. Add tags to `baseApi.tagTypes`.
  3. `getDeviceState` uses `onCacheEntryAdded`: wait `cacheDataLoaded`, `subscribeDevice(deviceId)`, listen `device:status` for that device, `updateCachedData(() => newDto)` **only if** `newDto.updatedAt >= current.updatedAt`; on `cacheEntryRemoved` unsubscribe.
  4. `getDeviceEvents` also prepends live `device:event` items (keep max 200 in cache).
  5. DevicesPage: list with type, liveness badge, last seen (IST), firmware, relay ON count (`x / 16` for LED), simulation badge. Planned device types show "Planned" badge.
  6. DeviceDetailPage: state summary, connectivity (SSID/IP/RSSI with label from FRS RSSI table), RTC block, events list, telemetry (RSSI line using existing `LineChart`, lazy), link to control page.
  7. `shared/utils/time.ts`: `formatIst(iso)` with `Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' })`, `formatRelative(iso)`.
  8. `features/devices/utils/rssi.ts`: −30…−50 Excellent, −51…−60 Very good, −61…−70 Good, −71…−80 Weak, < −80 Very weak.
- **Done when:** component tests with MSW + mocked socket: live `device:status` updates the page without refetch; older `updatedAt` is ignored.

#### T3.4 — LED control feature
- **Depends:** T3.3, T2.8
- **Create** `src/features/ledControl/` and `src/features/commands/`:
  - `commands/api/commandApi.ts`: `submitCommand({ deviceObjectId, body })` with header `Idempotency-Key: crypto.randomUUID()` (one key per click); `getCommand`.
  - `commands/store/commandsSlice.ts`: `byId: Record<commandId, CommandDto>`, `pendingKey: Record<deviceId, Record<'ALL' | relayNumberString, commandId>>`. Actions `commandSubmitted`, `commandUpdated` (clears pending key when status is terminal). Selectors with `createSelector`.
  - `commands/hooks/useCommandUpdates(deviceId)`: subscribes `command:updated` for this device and dispatches `commandUpdated`. On mount loads non-terminal commands via `getDeviceCommands({ status })` to restore pending state after reload.
  - `ledControl/hooks/useLedController(deviceObjectId, deviceId)` returns `{ state, liveness, simulationMode, mode, canCommand, blockReason, relays: Array<{ relay, reportedOn, pending, lastCommand }>, setRelay(relay, on), setAll(on) }`.
    - `canCommand` = liveness `ONLINE` AND has `DEVICE_COMMAND` AND mode allows (D-11 same rules as backend) AND realtime connected.
    - `blockReason` = text key from section 9.
  - Components (views only): `LedControlPage` (route `/devices/:deviceId/control`), `SimulationBanner`, `LivenessBadge`, `RelayGrid` (4×4 desktop, 2 columns mobile), `RelayCard` (number 1–16, room label placeholder, `RelayStateLabel`, ON and OFF buttons, pending spinner, last result pill, last change time), `BulkControlBar` (All ON / All OFF, visible only with `DEVICE_COMMAND_BULK`), `ConfirmDialog` (shared `Modal`), `CommandStatusPill`.
  - `ledText.ts` with all texts from section 9.
  - RelayCard shows **reported** state from telemetry. While pending, show requested state as `→ ON` next to the pending text. Buttons for that relay disabled while pending. Both buttons disabled when `!canCommand`.
  - Single relay ON/OFF: no confirmation (TODO(owner-decision O-6)). All ON/All OFF: always confirm.
- **Tests:** banner visible when simulation; label texts exact; click ON → pending → `command:updated` EXECUTED → "Done" and pending cleared; TIMEOUT shows text; offline disables buttons with offline text; viewer sees no buttons; technician sees no bulk bar; bulk requires confirm.
- **Done when:** tests pass.

#### T3.5 — Dashboard
- **Depends:** T3.4
- **Steps:** `useDashboard` aggregates: per device card (liveness, last seen, mode, simulation badge, relay ON count, Wi-Fi IP/RSSI label, MQTT connected, RTC valid + last sync); alerts list (devices OFFLINE/STALE, RTC invalid, last 5 failed/timed-out/rejected commands); recent events (last 10 across devices). Subscribes to each listed device via `getDeviceState`. Remove farm/consumer-specific widgets from the CIMCMS dashboard behind feature flag `VITE_FF_CIMCMS=true` (keep old dashboard when false).
- **Done when:** component test renders all fields from a fixture; alert appears when a device goes OFFLINE via socket.

#### T3.6 — History pages
- **Depends:** T3.3
- **Steps:** `/devices/:deviceId/commands` (table: time IST, user, action, relay, requested state, status pill, reason, latency = completedAt − issuedAt), `/devices/:deviceId/events`, `/audit` (AUDIT_READ). Use `DataTable` + `usePaginationParams`. Filters: status, type, date range (convert local date inputs to UTC ISO).
- **Done when:** tests for filters and pagination with MSW.

#### T3.7 — Navigation and permission gating
- **Depends:** T3.4–T3.6
- **Steps:** sidebar entries for Dashboard, Devices, Audit, Users (admin), Settings; route table entries with `permissions`; hide farm/consumer menu items when `VITE_FF_CIMCMS=true`. 403 page for direct URL access without permission.
- **Done when:** test: VIEWER cannot open `/users` (403), sees no command controls.

#### T3.8 — Playwright end-to-end acceptance tests
- **Depends:** T3.7, T2.11
- **Setup:** `apps/web/e2e/` with `playwright.config.ts`; global setup expects dev infra running (`npm run dev:infra`), seeds test users (`e2e-admin`, `e2e-viewer`, `e2e-tech` with passwords from `apps/web/e2e/.env.e2e`, git-ignored; `.env.e2e.example` committed), starts API and web dev servers (`webServer` option), starts simulator via `startSimulator` from `@cimcms/device-sim`.
- **Tests (map to FRS acceptance criteria, section 11):** login; LED-01 visible online + SIMULATION badge; 16 relays shown with `Logical:` labels; relay 2 ON → Pending → `Logical: ON` + Done without reload; All OFF needs confirm; simulator stopped → Offline text + disabled controls; `--ignore-commands` → "No reply from device"; viewer sees no controls; command history shows user, relay, requested state, result, time; page source and network responses contain no `MQTT_PASSWORD` value and no `mqtt://`/`mqtts://` credentials.
- **Done when:** `npx playwright test` passes locally. Add an optional CI job (manual trigger) that runs the same with Docker services.

### Phase 4 — MVP deployment (agent writes files and runbooks; humans run them on the server)

#### T4.1 — Dockerfiles
- **Depends:** Phase 3
- **API** `apps/api/Dockerfile` (build context = repo root):
  - Stage `builder` (`node:20`): copy root `package.json`, `package-lock.json`, and every workspace `package.json`; `npm ci`; copy `packages/contracts` and `apps/api`; build contracts; `npm run gp -w apps/api`; build api with tsup `noExternal: ['@cimcms/contracts']` (bundle contracts in, so the runtime does not need the workspace link).
  - Stage `runner` (`node:20`, not slim — Prisma engines need OpenSSL): copy `apps/api/dist`, root `node_modules`, `apps/api/openapi.yaml`, `apps/api/package.json`. **No `.env`.** `USER node`. `EXPOSE 3814`. `CMD ["pm2-runtime", "dist/app.js"]` (fork mode, 1 instance — do not add `-i`).
- **Web** `apps/web/Dockerfile`: build with `VITE_API_BASE_URL=/api`, `VITE_FF_CIMCMS=true`; final image `nginx:1.27-alpine` with `dist/` in `/usr/share/nginx/html` and config from `infra/prod/nginx/cimcms.conf`.
- **Done when:** both images build locally from root: `docker build -f apps/api/Dockerfile .` and `docker build -f apps/web/Dockerfile .`; `docker history` / `docker run --rm <api-image> ls -la` shows no `.env`.

#### T4.2 — Production compose and Nginx
- **Depends:** T4.1
- **Create** `infra/prod/docker-compose.yml`:
  - `web`: image `cimcms-web:<tag>`, ports `80:80`, `443:443`, mounts `/etc/letsencrypt:/etc/letsencrypt:ro`, `/var/www/certbot:/var/www/certbot:ro`, depends on `api`.
  - `api`: image `cimcms-api:<tag>`, `env_file: /opt/cimcms/secrets/api.env` (outside the repo, mode 600), `expose: ["3814"]`, healthcheck `curl -fsS http://localhost:3814/health/ready`, `restart: unless-stopped`, depends on `mongo` healthy.
  - `mongo`: `mongo:7`, `--replSet rs0 --keyFile /etc/mongo/keyfile --bind_ip_all`, auth enabled (root user from env file), volume `mongo-data`, **no published ports**, healthcheck with rs init like dev but with credentials and member host `mongo:27017` (not `localhost`, because the API connects from another container). Production `DATABASE_URL`: `mongodb://<user>:<pass>@mongo:27017/cimcms?replicaSet=rs0&authSource=admin`.
  - `minio`: include only if the existing upload features are used in this deployment (ask owner; default: omit).
  - All services: `logging: { driver: json-file, options: { max-size: "10m", max-file: "5" } }`.
- **Create** `infra/prod/nginx/cimcms.conf`:
  ```nginx
  server {
    listen 80;
    server_name <domain>;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
  }
  server {
    listen 443 ssl http2;
    server_name <domain>;
    ssl_certificate     /etc/letsencrypt/live/<domain>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<domain>/privkey.pem;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; connect-src 'self' wss://<domain>; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'" always;

    root /usr/share/nginx/html;
    location / { try_files $uri /index.html; }

    location /api/ {
      proxy_pass http://api:3814/<MAIN_ROUTE>/;
      proxy_set_header Host $host;
      proxy_set_header X-Request-Id $request_id;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /socket.io/ {
      proxy_pass http://api:3814;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_read_timeout 75s;
    }
  }
  ```
  Check the CSP against the built app (ECharts, fonts); loosen only what is needed and note it.
- **Create** `infra/prod/api.env.example` (placeholders only; production values: `NODE_ENV=production`, `APP_BASE_URL=https://<domain>`, `MQTT_URL=mqtts://<broker-host>:8883`, `MQTT_CLIENT_ID=cimcms-backend`, `API_DOCS_ENABLED=false`, `REFRESH_COOKIE_PATH=/api/user/token`, ...).
- **Done when:** `docker compose -f infra/prod/docker-compose.yml config` validates; a local run with self-signed certs serves the SPA, `/api/user/me` returns 401 JSON, and WebSocket connects.

#### T4.3 — Mosquitto hardening runbook  *(HUMAN-ONLY execution; needs senior review)*
- **Depends:** none (can be written any time)
- **Create** `docs/runbooks/mosquitto-hardening.md` with these steps for a human operator:
  1. Agree a maintenance window with the owner. Inform them the Humidifier could be affected if a step is wrong.
  2. Record current state: Mosquitto version, `mosquitto.conf`, include dirs, password file path, ACL file (if any), listeners, whether `per_listener_settings` is set, systemd unit. Subscribe to `cimcms/humidifier/#` and record what the Humidifier publishes and subscribes to.
  3. Back up all config files with a timestamp. Write the rollback commands before changing anything.
  4. Test every change first on a copy of the config in a local Mosquitto container (same version).
  5. Create accounts with `mosquitto_passwd` (passwords generated with a password manager, never pasted into chat or Git): `cimcms-backend`, `LED-01` (username = device ID).
  6. ACL file. **If the broker has no ACL today, enabling one denies everything not listed — the `mqttuser` block below is mandatory or the Humidifier stops working.**
     ```
     # Existing shared account used by the Humidifier. Keep full access until the Humidifier
     # is reflashed with its own account. Then replace with exact topics and rotate the password.
     user mqttuser
     topic readwrite #

     user cimcms-backend
     topic read cimcms/led/+/status
     topic read cimcms/led/+/telemetry
     topic read cimcms/led/+/ack
     topic read cimcms/led/+/event
     topic write cimcms/led/+/command
     topic write cimcms/led/+/config
     topic read cimcms/humidifier/+/status
     topic readwrite cimcms/backend/status

     # Device accounts: username must equal the device ID
     pattern write cimcms/led/%u/status
     pattern write cimcms/led/%u/telemetry
     pattern write cimcms/led/%u/ack
     pattern write cimcms/led/%u/event
     pattern read cimcms/led/%u/command
     pattern read cimcms/led/%u/config
     ```
  7. TLS listener: obtain a certificate for `mqtt.<domain>` (Let's Encrypt); add `listener 8883` with `certfile`, `keyfile`. Keep `listener 1883` for the Humidifier. Do not enable `per_listener_settings` unless it is already on (turning it on changes how auth settings apply). Ensure `persistence true` (backend persistent session survives broker restart).
  8. Certificate renewal hook: reload or restart Mosquitto after renewal; verify on the installed version whether `SIGHUP` reloads certificates; schedule the restart in a quiet hour.
  9. Firewall: allow 8883; restrict 1883 to the facility's public IP if it is static (ask owner), else leave open and record the risk.
  10. Apply, reload, verify: Humidifier status still arrives on `cimcms/humidifier/<id>/status`; backend account can read LED topics; `LED-01` account cannot write `cimcms/led/LED-02/...`; anonymous connection refused.
  11. Rollback if any verification fails.
  12. After the Humidifier is migrated (owner decision O-12): give it its own account, narrow its ACL, rotate `mqttuser`, close 1883.
- **Done when:** runbook reviewed by owner.

#### T4.4 — Backup and restore
- **Depends:** T4.2
- **Create** `infra/prod/scripts/backup-mongo.sh` (`docker compose exec -T mongo mongodump --archive --gzip --username ... --authenticationDatabase admin > /var/backups/cimcms/mongo-$(date +%F).archive.gz`; keep 14 daily + 8 weekly; copy off-server to a destination the owner names — TODO(owner-decision O-13)), `restore-mongo.sh`, and `docs/runbooks/backup-restore.md` (cron line, restore steps, quarterly restore drill on a scratch server, also back up Mosquitto config, ACL and passwd files and `/opt/cimcms/secrets` in an encrypted store).
- **Done when:** local test: backup from dev mongo, restore into an empty container, record counts match.

#### T4.5 — Deploy runbook
- **Depends:** T4.1–T4.4
- **Create** `docs/runbooks/deploy.md`: server prerequisites (Docker, compose plugin, firewall 80/443/8883, SSH key access), first install (secrets file, mongo keyfile, certbot webroot certificate, `docker compose up -d`, `npm run seed` + `seed:admin` inside the api container, seed devices), update procedure (pull images by tag, `docker compose up -d`, check `/health/ready`), rollback (previous tag), smoke test checklist = FRS acceptance criteria list.
- **Done when:** owner reviews; a full dry run on a staging VM (if available) is recorded in PROGRESS.md.

### Phase 5 — Configuration and automation (post-MVP)

**Do not start Phase 5 until the owner answers O-3, O-9 and O-15.** Use the same task pattern (contracts → model → service → routes → tests → UI → tests).

#### T5.1 — Rooms and relay assignment
- Models: `Room { id, farmId?, code @unique, name, status (ACTIVE|INACTIVE), notes?, timestamps }`, `RoomChannelAssignment { id, roomId, deviceId, relay (1..16), label?, timestamps, @@unique([deviceId, relay]), @@index([roomId]) }`. The unique index prevents one relay in two rooms (FRS 9.4).
- Routes: `GET/POST /rooms`, `PUT /rooms/:id`, `GET/PUT /rooms/:id/channels` (replace full set; validate relay range against driver `channelCount`; duplicate → 409 `RELAY_ALREADY_ASSIGNED` naming the other room). ROOM_READ / ROOM_WRITE. Audit every change.
- UI: rooms list/edit; channel picker showing which relays are taken; room label shown on RelayCard; group-by-room view on control page.

#### T5.2 — Operating modes
- Contracts: add `SET_MODE` to `MVP_COMMAND_ACTIONS` for LED and to `submitCommandBodySchema`.
- Backend: `SET_MODE` needs `DEVICE_MODE_SET`; target `AUTO` requires AUTO readiness (T5.3) else 409 `AUTO_NOT_CONFIGURED`; target `EXPERIMENT` requires a READY experiment else 409 `EXPERIMENT_NOT_CONFIGURED`; TECHNICIAN may only enter/exit `MAINTENANCE` (TODO O-4). Exiting MAINTENANCE requires an explicit SET_MODE (FRS 4.3).
- UI: mode page with current mode, readiness indicators, confirmation dialog, mode history (events `MODE_CHANGED`).

#### T5.3 — AUTO schedules
- Models: `Schedule { id, roomId, name, status (DRAFT|PUBLISHED|ARCHIVED), latestVersion, publishedVersion? }`, `ScheduleVersion { id, scheduleId, version, rules Json /* [{days, on, off}] */, effectiveFrom, effectiveTo?, createdById, publishedAt? }` (immutable once published), `DeviceConfig { id, deviceId, configVersion, payload Json, sourceVersions Json, status (PUBLISHED|APPLIED|REJECTED), publishedAt, appliedAt?, reason? , @@unique([deviceId, configVersion]) }`.
- Validation: `on != off`; overlap check per relay: convert every window to minute intervals in a week (0–10080, Monday 00:00 = 0); a window with `off < on` ends on the next day (Sunday wraps to Monday); any two intervals on the same relay that overlap → 400 `SCHEDULE_OVERLAP` with details.
- Compile: for a device, gather published versions of schedules for rooms that own its relays → `configWireSchema` payload; reject if serialized size > `MAX_CONFIG_PAYLOAD_BYTES` (400 `SCHEDULE_TOO_LARGE`).
- Publish: `POST /schedules/:id/publish` (SCHEDULE_PUBLISH) → new ScheduleVersion published → compile → `DeviceConfig` with next `configVersion` → MQTT publish to `config` topic **retained**, QoS 1 → status PUBLISHED. Device `CONFIG_APPLIED` event (`data: { config_version, result: 'APPLIED'|'REJECTED', reason? }`) or telemetry `config_version >= version` → APPLIED/REJECTED. Emit `schedule:updated`.
- AUTO readiness for a device = latest DeviceConfig APPLIED, `auto` not null, today (IST) inside effective dates, telemetry `auto_ready !== false`.
- UI: schedule editor (days, on/off times in IST, effective dates), validation messages, version history, publish button with device acknowledgement status.
- Simulator: implement config handling and a simple executor (apply windows every minute in simulation) so the flow is testable before firmware.

#### T5.4 — Experiments
- Models: `Experiment { id, code @unique, title, description?, status (DRAFT|READY|RUNNING|PAUSED|COMPLETED|STOPPED), startsAt, endsAt, createdById }`, `ExperimentAssignment { id, experimentId, groupLabel, deviceId, relay, windows Json }`.
- Lifecycle and pause semantics: TODO(owner-decision O-15). Compiled into the `experiment` block of the device config; RUNNING = config applied + SET_MODE EXPERIMENT.
- UI: create/edit, groups/conditions, start/pause/stop with confirmation, event log.

#### T5.5 — RTC and diagnostics
- Contracts: add `RTC_SYNC_NOW` for LED. Route `POST /devices/:id/rtc-sync` (DEVICE_DIAGNOSTICS) → command.
- UI system page: MQTT backend connection (from `/health/ready`, admin only), per-device RTC block (valid, source, last sync, result, drift, lost power), Wi-Fi block, "Sync now" button. Wi-Fi scan results only if the device reports them (not in contract v1 — mark "planned").

#### T5.6 — Reports and CSV export
- Routes (REPORT_EXPORT): `GET /reports/relay-on-time.csv?from&to&deviceId` (per relay per day, computed from RelayStateChange), `GET /reports/commands.csv`, `GET /reports/availability.csv` (from ONLINE/OFFLINE/STALE events), stream rows, max 31-day range, times in IST in the CSV with a UTC column too.
- UI: reports page with date range and download buttons.

### Phase F — Firmware contract work (firmware team, separate repo — for reference only)

The agent does not change firmware. Give this list to the firmware developer:

1. Record the authoritative firmware version and commit (FRS source-version gate).
2. MQTT over TLS on 8883; embed ISRG Root X1 CA; username = client ID = device ID; clean session true; keepalive 30 s; LWT = retained JSON offline status.
3. MQTT buffer ≥ 4096 bytes (with PubSubClient: `setBufferSize(4096)`; default is 256 and telemetry will not fit).
4. On connect: retained online status, `BOOT` event (new random `boot_id`), telemetry. Telemetry on every change and every 30 s, with `seq`.
5. Command handling exactly as the simulator rules in T1.3 step 5, including 32-entry duplicate ring buffer and expiry check (if RTC invalid: accept live commands and set `clock_unverified: true` — O-5).
6. `RELAY_CHANGED` event on every relay change with the correct `source`; `MODE_CHANGED` on mode change.
7. `simulation_mode` in every telemetry and ack.
8. Validate captured payloads against `packages/contracts/json-schema/*.schema.json`.
9. Never print Wi-Fi or MQTT passwords to serial or logs.
10. Phase 5: config topic, store config in NVS, local schedule executor, `CONFIG_APPLIED` event, `config_version` and `auto_ready` in telemetry.

### Phase 6 — Physical deployment (HUMAN-ONLY)

Per FRS §15 Phase 5: verify relay polarity and wiring, test each relay without mains loads, disable simulation only after safe hardware checks, test failure and recovery, electrical safety validation before connecting cultivation lighting. When `simulation_mode` becomes false, the UI automatically switches to the `Relay: ON (no lamp feedback)` wording.

---

## 11. FRS acceptance criteria → where they are built and tested

| # | Criterion (FRS §16) | Built in | Tested in |
| --- | --- | --- | --- |
| 1 | Secure login over HTTPS | T2.3, T3.1, T4.2 | T2.3 tests, T3.8 |
| 2 | LED-01 with online/offline and simulation status | T2.6, T3.3 | T2.6, T3.8 |
| 3 | All 16 reported logical states | T2.6, T3.4 | T3.4, T3.8 |
| 4 | Individual ON/OFF command | T2.8, T3.4 | T2.8, T3.8 |
| 5 | Pending until device ACK | T2.8 (rule 3), T3.4 | T3.4, T3.8 |
| 6 | ESP32 changes logical state in simulation and publishes ACK/telemetry | Phase F; simulator T1.3 | T1.3, T2.11 |
| 7 | Browser updates over WSS without refresh | T2.7, T3.2, T3.3 | T2.7, T3.8 |
| 8 | All ON/OFF have confirmation and audit records | T3.4 (bulk confirm), T2.8 (audit) | T3.4, T2.11 — single-relay confirm is O-6 |
| 9 | Failed/expired/rejected/timed-out distinguishable | section 8, section 9 texts | T2.8, T3.4, T3.8 |
| 10 | MQTT secrets never reach the browser | D-6, T0.3, T4.1 | T3.8 secret scan |
| 11 | Existing Humidifier keeps working | D-13, D-14, T4.3 | T4.3 step 10 |
| 12 | UI never claims a physical lamp is ON in simulation | section 9 | T3.4, T3.8 |

---

## 12. Human-only actions (agent must not do these)

- Rotate secrets that were committed in `.env` (T0.3).
- Any SSH or change on the production server or the live Mosquitto broker (T4.3, T4.5).
- Create production passwords, certificates, DNS records.
- Decide the open decisions below.
- Physical relay tests and switching simulation off (Phase 6).

---

## 13. Open decisions (owner) and defaults used until answered

| ID | Question | Default in this plan | Blocks |
| --- | --- | --- | --- |
| O-1 | MongoDB (existing) or PostgreSQL (FRS recommendation)? | MongoDB (D-1) | T2.1 |
| O-2 | One monorepo, or keep separate API and UI repos? Repo URLs? | Monorepo (D-2) | T0.1 |
| O-3 | Manual override while in AUTO/EXPERIMENT? | Not allowed; relay commands blocked (D-11) | Phase 5 |
| O-4 | Remote commands in MAINTENANCE/EXPERIMENT; technician rights | MAINTENANCE needs DEVICE_DIAGNOSTICS; EXPERIMENT blocked | T2.8 (default ok), T5.2 |
| O-5 | Command expiry when device RTC is invalid | Device accepts live commands, ack `clock_unverified: true` | Phase F |
| O-6 | Confirmation for single relay ON/OFF too, or only All ON/OFF? | Only All ON/OFF | T3.4 (default ok) |
| O-7 | Data retention | Telemetry, events, relay changes 365 days; commands and audit kept | T2.10 (default ok) |
| O-8 | Final device ID format | `LED-01` | Seed, firmware |
| O-9 | Real room names and relay-to-room mapping | None — required | T5.1 |
| O-10 | Raspberry Pi role | Not in MVP; cloud-direct | — |
| O-11 | Heartbeat 30 s, stale 75 s, command TTL 15 s | As listed | — |
| O-12 | Humidifier migration to TLS and own account | Keep 1883 + `mqttuser` until reflash | T4.3 step 12 |
| O-13 | Domain, hosting provider, OS, off-server backup destination | Unknown — required | Phase 4 |
| O-14 | InfluxDB needed? | No (Mongo time-series) | — |
| O-15 | Experiment pause semantics; state of relays not in an experiment | Unknown — required | T5.4 |
| O-16 | Topic segment names for Steam and Environment modules | `steam`, `environment` placeholders, no subscriptions | Future modules |

---

## 14. Adding a new device module later (e.g. Steam Generator)

1. Owner confirms hardware and control requirements.
2. `packages/contracts`: set `DEVICE_TYPES.STEAM_GENERATOR` to `IMPLEMENTED`, add its wire schemas, actions and fixtures; export JSON Schema.
3. `apps/api`: driver handlers for its topics in ingest; extend command validation for its actions; permissions if new.
4. Mosquitto ACL: backend read/write lines and device `pattern` lines for its segment (human, via runbook).
5. `apps/web`: new feature folder for its control/status panel; dashboard card.
6. Simulator mode for the new type; tests; no change to LED code.
