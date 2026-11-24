# CIMCMS — Final report

Date: 2026-11-22. Repo: `C:\project\cims_phase\cimcms` (local only, nothing pushed, no remote).
Plan: `docs/plan.md`. Task detail, deviations and owner questions: `docs/PROGRESS.md`.

## 0. Post-run review (2026-11-22, second session)

The autorun result was checked and improved. Details: `docs/PROGRESS.md` D22 and D23. Not committed yet.

- **Database: MongoDB → PostgreSQL 16** (owner decision O-1). Prisma migrations (`apps/api/src/models/tables/migrations`), UUID ids, foreign keys, `CommandAck` and `Telemetry` tables, advisory locks. Dev compose, prod compose, api image (runs `prisma migrate deploy` at start), backup/restore scripts and runbooks all moved to Postgres.
- **Security fixes (7 critical, 2 high from an independent review):** unauthenticated device/farm/master routes; any logged-in token (including a public consumer registration) could create SUPER_ADMIN users, edit roles and permissions, or reset any password. All closed and covered by `apps/api/test/security.test.ts`.
- **Reliability fixes:** command in-flight limit is now atomic, Idempotency-Key bound to the request, MQTT publish timeout, liveness sweeper race, all-or-nothing experiment pause/resume, atomic experiment READY claim.
- **Follow-up fixes (D24):** devices left in EXPERIMENT mode after an offline stop are returned to MANUAL by the sweeper; two tabs refreshing at once no longer log the user out (10 s grace); local dev `.env` points at Postgres; old dev Mongo container stopped.
- **Automatic broker accounts for devices (2026-11-23, D25):** with `MQTT_PROVISIONING=dynsec`, adding a device in the web app creates its own Mosquitto account through the Dynamic Security plugin, limited to that device's own topics. The random password is shown once to the admin and only the broker keeps its hash; Reset password and delete are in the web app, and all three actions are audited. Backend and admin MQTT credentials still never reach the browser. It runs on the dev broker next to the existing password and ACL files (verified). The production broker change is human-only (`docs/runbooks/mosquitto-hardening.md` step 13); until then the default `MQTT_PROVISIONING=manual` keeps today's manual way of creating device accounts.
- **Own MQTT broker replaces Mosquitto (2026-11-24, D26):** `apps/broker` (aedes) takes logins from the CIMCMS database (`MqttAccount`) and keeps retained messages there, so the database backup covers both. Docker image, prod compose service `broker`, server bundle `infra/server-broker/` with switch-over and rollback steps (the Humidifier keeps its `mqttuser` password as a LEGACY account), dev via `npm run dev:broker`, and Playwright e2e starting the broker itself. The server switch-over is human-only (`infra/server-broker/README.md`, `docs/runbooks/broker.md`); Mosquitto files are kept for rollback.

Verification on the final tree (2026-11-22):

| Command | Result |
| --- | --- |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors (warnings: api 50, web 17) |
| `npm test` | contracts 56/56, api 230/230 (21 files, embedded PostgreSQL 16, real migrations), web 127/127, device-sim 22/22 |
| `npm run build` | contracts, api, web build |
| `npx playwright test` (apps/web) | 11/11 pass (3.5 min) against dev PostgreSQL, dev Mosquitto, real API and simulator |
| `docker build -f apps/api/Dockerfile .` | builds; on start the entrypoint applied `20261122101828_init` to an empty database; no `.env` in the image |
| backup → restore | `backup-postgres.sh` + `restore-postgres.sh` round trip on the dev container |

Sections 2 and 3 below describe the first (MongoDB) run and are kept for history; acceptance-criteria evidence is unchanged and still passes on PostgreSQL.

## 1. Tasks

Several tasks share one commit because their changes interleave (parallel agents). Hashes are short.

| Task | Status | Commit(s) |
| --- | --- | --- |
| T0.1 monorepo + subtree imports | done | 2a335c7, 9b45ab5, 2d54d91, 93534ef |
| T0.2 npm workspaces | done | a101fd3 |
| T0.3 remove committed secrets | done (rotation human-only) | d1e8aa3 (env deletion), 666af29 |
| T0.4 middleware order, rate limits (needs senior review) | done | f200007 |
| T0.5 code gaps | done | f200007 |
| T0.6 request id + Zod validate | done | 761b196 |
| T0.7 API test setup | done | b11970a |
| T0.8 web test setup | done | 7499d64 |
| T0.9 CI | done-unverified (no remote) | 0185abc |
| T1.1 contracts | done | c5bb1a1 |
| T1.2 dev infra | done | d1e8aa3 |
| T1.3 device simulator | done | d56e71f |
| T2.1 Prisma models, time-series | done | e9f57aa |
| T2.2 RBAC + seed | done | e9f57aa |
| T2.3 auth, refresh cookie (needs senior review) | done | 03fd295 |
| T2.4 driver registry | done | 761b196 |
| T2.5 MQTT client + dispatcher | done | 761b196 |
| T2.6 ingest (needs senior review) | done | 3de11f6 |
| T2.7 realtime gateway | done | 3de11f6, 89290fa |
| T2.8 command service (needs senior review) | done | 3de11f6 |
| T2.9 read endpoints | done | a76806b |
| T2.10 health, liveness, retention jobs | done | a76806b |
| T2.11 backend e2e | done | a76806b |
| T3.1 auth + refresh (web) | done (hard reload verified by Playwright) | 2ab27ee |
| T3.2 realtime client | done | 2ab27ee |
| T3.3 devices on live API | done | 2ab27ee |
| T3.4 LED control | done | 01a4a0f |
| T3.5 dashboard | done-unverified (unit tests only) | 01a4a0f |
| T3.6 history pages | done | 01a4a0f |
| T3.7 navigation + permission gating | done-unverified (unit tests only) | 01a4a0f |
| T3.8 Playwright acceptance | done | ffe5f68 |
| T4.1 Dockerfiles | done | 59f4433 |
| T4.2 prod compose + nginx | done-unverified (self-signed local smoke only) | 59f4433 |
| T4.3 Mosquitto hardening runbook (needs senior review) | human-only | 5ec9fb9 |
| T4.4 backup and restore | done | 59f4433 |
| T4.5 deploy runbook | done-unverified (no staging VM) | 59f4433 |
| T5.1 rooms | done | 84b5923 |
| T5.2 operating modes | done | 84b5923 |
| T5.3 AUTO schedules | done | 84b5923 |
| T5.4 experiments | done | 84b5923 |
| T5.5 RTC and diagnostics | done | 84b5923 |
| T5.6 reports + CSV | done | 84b5923 |

No task is `blocked`. Phase F (firmware) and Phase 6 (physical) are human work and outside the repo.

## 2. Verification (run 2026-11-22 on the final tree)

| Command | Result |
| --- | --- |
| `npm run lint` | 0 errors. Warnings: api 54, web 17. |
| `npm run typecheck` | 0 errors (contracts, api, web, device-sim). |
| `npm test` | contracts 56/56, api 197/197 (20 files), web 127/127 (14 files), device-sim 22/22. |
| `npm run build` | contracts, api (tsup), web (vite) all build. |
| `cd apps/web && npx playwright test` | 11/11 pass (3.2 min) against the real API, dev Mongo (scratch db `cimcms_e2e`), dev Mosquitto and the simulator. |
| `docker build` api + web from repo root | Both images rebuild on the final tree. `find / -name '.env*'` in the api image (outside node_modules) finds nothing. Prod compose `config` needs the external secrets files (`/opt/cimcms/secrets/*.env`), so it validates only on a prepared server; it validated with throwaway secrets on 2026-11-21 (T4.2). |

Flake fixed: one web test (lazy route chunk) timed out under load once. `asyncUtilTimeout` is now 8 s; 3 consecutive full web runs passed 127/127.

Not run: GitHub Actions (no remote), certbot/Let's Encrypt, the real mqtts broker, the full FRS smoke checklist on a staging server, the off-server backup copy.

## 3. FRS acceptance criteria (plan section 11)

Playwright test names are from `apps/web/e2e/acceptance.spec.ts` (numbers 1–11 in file order).

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Secure login over HTTPS | met in code, TLS needs human | T2.3 `auth-refresh.test.ts` (cookie flags, rotation, reuse); e2e 1 (login, wrong password, reload). HTTPS only smoke-tested with a self-signed certificate (T4.2). |
| 2 | LED-01 online/offline + simulation status | met | `ingest.test.ts`; e2e 2 (Online + SIMULATION badge), e2e 6 (offline and recovery). |
| 3 | All 16 reported logical states | met | `ingest.test.ts`; `ledControl.test.tsx`; e2e 3 (16 `Logical:` labels). |
| 4 | Individual ON/OFF command | met | `command.test.ts`, `led-flow.test.ts`; e2e 4. |
| 5 | Pending until device ACK | met | `command.test.ts` (ack race), `ledControl.test.tsx`; e2e 4 (state stays OFF while Pending). |
| 6 | ESP32 changes logical state and publishes ACK/telemetry | simulator only; needs human (firmware) | `device-sim` tests (22), `led-flow.test.ts`. Real ESP32 not tested (Phase F). |
| 7 | Browser updates over WSS without refresh | met | `realtime.test.ts`, `devices.test.tsx`; e2e 4 (no reload). WSS over TLS: needs human. |
| 8 | All ON/OFF confirm + audit | met | `ledControl.test.tsx` (bulk confirm), `led-flow.test.ts` (`COMMAND_SUBMITTED`); e2e 5. Single-relay confirm is open decision O-6 (default: none). |
| 9 | Failed/expired/rejected/timed-out distinguishable | met | `command.test.ts`, `ledControl.test.tsx` (all section 9 texts); e2e 7 (`No reply from device`). |
| 10 | MQTT secrets never reach the browser | met | e2e 11 (HTML, responses, headers, WebSocket frames, storage, cookies); Docker image has no `.env`. |
| 11 | Existing Humidifier keeps working | needs human | Backend is monitor-only (`drivers.test.ts`, `mqtt.test.ts`); broker change is the T4.3 runbook step 10, executed by a person. |
| 12 | UI never claims a lamp is ON in simulation | met | `ledControl.test.tsx` (texts); e2e 3 (no lamp wording). |

## 4. Owner questions and defaults used

Full list: `docs/PROGRESS.md` ("Questions for owner").

- Q1/Q3: `.env`, `.env.dev`, `.env.prod` from the imported API repo are in Git history. Rotate JWT_SECRET_KEY, SESSION_SECRET_KEY, DATABASE_URL credentials, CLOUD_ACCESS_KEY/CLOUD_SECRET_KEY, MAIL_PASSWORD. Do not push before that.
- Q2: no Zod existed in either app. Default used: Zod 4.6.7 everywhere.
- O-3 relay commands blocked in AUTO/EXPERIMENT; O-4 TECHNICIAN only enters/leaves MAINTENANCE, MAINTENANCE relay commands need `DEVICE_DIAGNOSTICS`; O-5 device accepts live commands when RTC invalid, `clock_unverified` flag (firmware); O-6 no confirm for single relay; O-7 retention 365 days (telemetry, events, relay changes), commands and audit kept; O-9 no rooms seeded; O-10 no Raspberry Pi in MVP; O-12 Humidifier stays on 1883 with `mqttuser`; O-13 off-server backup destination unknown (`OFFSITE_CMD` hook); O-15 pause = SET_MODE MAINTENANCE, resume = SET_MODE EXPERIMENT, relays outside the experiment OFF; O-16 `steam`/`environment` topic segments are placeholders.
- Security findings from the first run (unauthenticated legacy routes, `POST /user` open to any token, login timing): **fixed 2026-11-22** (PROGRESS D23). Still open: the consumer `/auth` login signs 30-day tokens (they no longer pass any role or permission guard).

## 5. Human-only actions still to do, in order

1. Rotate the secrets in section 4 (Q1/Q3). Decide whether to rewrite history before any push (`git filter-repo`); this run never rewrote history.
2. Answer Q2 and the open decisions in plan section 13; adjust defaults in code at each `TODO(owner-decision O-x)`.
3. Add a Git remote, push, confirm GitHub Actions `ci.yml` is green (Node 20, `npm ci`).
4. Database: PostgreSQL migrations are applied automatically by the api container at start (`prisma migrate deploy`). Locally: `npm run db:deploy -w apps/api`.
5. Execute `docs/runbooks/mosquitto-hardening.md` in a maintenance window (keep the `mqttuser` ACL block; verify the Humidifier). Senior review first.
6. Provision server, DNS, certificate, secrets files; follow `docs/runbooks/deploy.md`; run the FRS smoke checklist; do a staging dry run.
7. Set the off-server backup destination (O-13) and run the first restore drill (`docs/runbooks/backup-restore.md`).
8. Firmware (Phase F): TLS 8883, MQTT buffer 4096, command rules from the simulator spec, schema validation with `packages/contracts/json-schema/*.schema.json`.
9. Phase 6: physical relay checks, electrical safety validation; only then consider turning simulation off. Never before.

## 6. Blocked tasks

None.

## 7. Run locally

Prerequisites: Node 20+ (tested on 22), Docker.

```powershell
npm ci
npm run build:contracts
npm run gp -w apps/api
npm run dev:infra
```

Create the broker accounts once (see `infra/dev/mosquitto/README.md`; passwords go only into git-ignored files). Create `apps/api/.env` from `apps/api/.env.example` (generate random JWT/session secrets and MQTT passwords; `DATABASE_URL` points at the dev Postgres on port 5433). An existing `apps/api/.env` from before 2026-11-22 still has a `mongodb://` URL: replace that line. Then:

```powershell
npm run db:deploy -w apps/api
$env:BOOTSTRAP_ADMIN_PASSWORD = '<at-least-12-characters>'
npm run seed -w apps/api
npm run seed:admin -w apps/api -- --email admin@example.test
npm run dev:api
npm run dev:web
$env:SIM_PASSWORD = '<LED-01 broker password>'
npm run sim -- --url mqtt://localhost:1883 --device LED-01 --username LED-01 --password-env SIM_PASSWORD
```

Open `http://localhost:5173`. Tests:

```powershell
npm test
cd apps/web
npx playwright install chromium
npx playwright test
```

Playwright needs `npm run dev:infra` running (PostgreSQL on 127.0.0.1:5433 + Mosquitto) and `infra/dev/.dev-credentials.local`; it uses its own scratch database `cimcms_e2e`. API unit/integration tests need no Docker: they start an embedded PostgreSQL 16.
