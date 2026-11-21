# CIMCMS — Progress

Plan: `docs/plan.md`. Work tasks in the execution order of plan section 10, one task per session.

Status values: `todo`, `in progress`, `done`, `done-unverified`, `blocked`, `human-only`.

Commit column: the task's own commit also contains this file, so it cannot record its own hash.
The next task back-fills it. To find any task's commits: `git log --oneline --grep "<task id>"`.

## Tasks

| Task | Title | Status | Date | Commit(s) | Notes |
| --- | --- | --- | --- | --- | --- |
| T0.1 | Create monorepo and import existing repos | done | 2026-11-21 | 2a335c7 (initial), 9b45ab5 (api subtree), 2d54d91 (web subtree), docs commit `chore: T0.1 add docs and progress file` | See deviations D1–D4 |
| T0.2 | npm workspaces | done | 2026-11-21 | see `git log --grep T0.2` | See deviations D5-D6 |
| T0.3 | Remove committed secrets | done | 2026-11-21 | see `git log --grep T0.3` | Docker build ok, image has no .env; rotation is HUMAN-ONLY (Q3); see D7 |
| T1.1 | packages/contracts | done | 2026-11-21 | see `git log --grep T1.1` | 37/37 tests, 6 JSON Schemas; Zod 4.6.7 (Q2 default); see D9 |
| T0.4 | API: middleware order, proxy trust, CORS, rate limits | done | 2026-11-21 | see `git log --grep T0.4` | needs senior review; live curl 429 not run (no Mongo then), proven by supertest; see D10 |
| T0.5 | API: fix known code gaps | done | 2026-11-21 | same commit as T0.4 | typecheck 0 errors; lint 0 errors/25 warnings; see D10 |
| T0.6 | API: request ID and Zod validation middleware | done | 2026-11-21 | see `git log --grep T0.6` | 6 tests; one commit with T2.4, T2.5 |
| T0.7 | API: test setup | done | 2026-11-21 | see `git log --grep T0.7` | 5/5 tests, no Docker |
| T0.8 | Web: test setup | done | 2026-11-21 | 7499d64 | `npm test -w apps/web` 1/1 pass |
| T0.9 | CI | done-unverified | 2026-11-21 | see `git log --grep T0.9` | no git remote: workflow not run; full local chain to be run after Phase 2 batch (see D11) |
| T1.2 | Dev infrastructure (Docker Compose) | done | 2026-11-21 | d1e8aa3 | rs0 ok; ACL verified; Prisma connect not tested; see D8 |
| T1.3 | Device simulator tools/device-sim | done | 2026-11-21 | see `git log --grep T1.3` | 14/14 tests; manual run vs dev broker not done; see D9 |
| T2.1 | Prisma models and time-series init | done | 2026-11-21 | see `git log --grep T2.1` | db push ok to scratch db `cimcms_t21check` on dev Mongo; telemetry tests pass; see D14 |
| T2.2 | RBAC and device seed | done | 2026-11-21 | same commit as T2.1 | 5 seed tests; see D14 |
| T2.3 | Auth: short access token, refresh cookie, /user/me | done | 2026-11-21 | see `git log --grep T2.3` | 16 new tests; needs senior review; see D16 |
| T2.4 | Device driver registry (API side) | done | 2026-11-21 | same commit as T0.6 | 5 tests |
| T2.5 | MQTT client and dispatcher | done | 2026-11-21 | same commit as T0.6 | 8 tests (aedes); not yet wired into app.ts (T2.6/T2.8); see D13 |
| T2.6 | Ingest service and device state | done | 2026-11-21 | see `git log --grep T2.6` (T2.6-T2.8 one commit) | needs senior review; api suite 83/83; see D17 |
| T2.7 | Realtime gateway (Socket.IO) | done | 2026-11-21 | see `git log --grep T2.6` (T2.6-T2.8 one commit) | api suite 83/83; see D17 |
| T2.8 | Command service, routes, timeout job | done | 2026-11-21 | see `git log --grep T2.6` (T2.6-T2.8 one commit) | needs senior review; api suite 83/83; see D17 |
| T2.9 | Device read endpoints | done | 2026-11-21 | see `git log --grep T2.9` (T2.9-T2.11 one commit) | 27 tests; api suite 128/128; see D19 |
| T2.10 | Health, liveness job, retention job | done | 2026-11-21 | see `git log --grep T2.9` (T2.9-T2.11 one commit) | 11 tests (fake timers); api suite 128/128; see D19 |
| T2.11 | Backend end-to-end test | done | 2026-11-21 | see `git log --grep T2.9` (T2.9-T2.11 one commit) | 7 e2e tests; api suite 128/128; see D19 |
| T3.1 | Auth: internal user login + refresh flow | done-unverified | 2026-11-21 | see `git log --grep T3.1` (T3.1-T3.3 one commit) | unit/MSW tests pass (28/28 web); not run against real API; see D12 |
| T3.2 | Realtime client | done-unverified | 2026-11-21 | see `git log --grep T3.1` (T3.1-T3.3 one commit) | unit/MSW tests pass (28/28 web); not run against real API; see D12 |
| T3.3 | Devices feature on real API with live state | done-unverified | 2026-11-21 | see `git log --grep T3.1` (T3.1-T3.3 one commit) | unit/MSW tests pass (28/28 web); not run against real API; see D12 |
| T3.4 | LED control feature | done-unverified | 2026-11-21 | see `git log --grep T3.4` (T3.4-T3.7 one commit) | web tests 76/76 with MSW + fake socket; not run against real API; see D15 |
| T3.5 | Dashboard | done-unverified | 2026-11-21 | see `git log --grep T3.4` (T3.4-T3.7 one commit) | web tests 76/76 with MSW + fake socket; not run against real API; see D15 |
| T3.6 | History pages | done-unverified | 2026-11-21 | see `git log --grep T3.4` (T3.4-T3.7 one commit) | web tests 76/76 with MSW + fake socket; not run against real API; see D15 |
| T3.7 | Navigation and permission gating | done-unverified | 2026-11-21 | see `git log --grep T3.4` (T3.4-T3.7 one commit) | web tests 76/76 with MSW + fake socket; not run against real API; see D15 |
| T3.8 | Playwright end-to-end acceptance tests | done | 2026-11-22 | see `git log --grep T3.8` | `npx playwright test` 11/11 (3.6 min) against real API + simulator; CI job manual only, not run (no remote); see D20 |
| T4.1 | Dockerfiles | done | 2026-11-21 | see `git log --grep T4.1` (T4.1/T4.2/T4.4/T4.5 one commit) | both images build from root; no .env in image; see D18 |
| T4.2 | Production compose and Nginx | done-unverified | 2026-11-21 | see `git log --grep T4.1` (T4.1/T4.2/T4.4/T4.5 one commit) | compose config valid; local self-signed smoke ok (SPA, 301, /api 401 JSON, WS 101); api healthcheck needs T2.10; no certbot/real broker/domain; see D18 |
| T4.3 | Mosquitto hardening runbook | human-only | 2026-11-21 | see `git log --grep T4.3` | runbook written at `docs/runbooks/mosquitto-hardening.md`; owner review and execution pending; needs senior review |
| T4.4 | Backup and restore | done | 2026-11-21 | see `git log --grep T4.1` (T4.1/T4.2/T4.4/T4.5 one commit) | dev Mongo backup restored to fresh container, counts match incl. time-series; offsite copy TODO O-13; see D18 |
| T4.5 | Deploy runbook | done-unverified | 2026-11-21 | see `git log --grep T4.1` (T4.1/T4.2/T4.4/T4.5 one commit) | runbook written; no staging VM dry run possible; see D18 |
| T5.1 | Rooms and relay assignment | todo | | | Phase 5: waits for O-3, O-9, O-15 |
| T5.2 | Operating modes | todo | | | Phase 5 |
| T5.3 | AUTO schedules | todo | | | Phase 5 |
| T5.4 | Experiments | todo | | | Phase 5 |
| T5.5 | RTC and diagnostics | todo | | | Phase 5 |
| T5.6 | Reports and CSV export | todo | | | Phase 5 |

## Owner decisions recorded

- O-2 (2026-11-21): monorepo confirmed by the owner. Import sources confirmed by the owner:
  - API: local clone `C:\project\cultivo_iot_api`, branch `refactor-core` (commit `20ca006`; same as `origin/refactor-core` at the last fetch). Upstream: `github.com/cpballresearch/cultivo_iot_api`.
  - Web: local clone `C:\project\cultivo_iot_dashboard`, ref `origin/refactor-core` (commit `88f1341`; the clone has no local branch of that name). Upstream: `github.com/cpballresearch/cultivo_iot_dashboard`.
  - Monorepo location: `C:\project\cims_phase\cimcms`.

## Deviations

- **D1 (T0.1):** Subtrees were imported from local clones, not from remote URLs, as the owner chose. History is the same as the upstream branch at the last fetch of each clone. To re-sync later: `git subtree pull --prefix=apps/<app> <url> refactor-core`.
- **D2 (T0.1):** The web repo's `main` branch contains only a `README.md`. The React app lives on `refactor-core`, which was imported.
- **D3 (T0.1):** The four source documents were moved from `C:\project\cims_phase\` into `docs/source/`. The original `plan.md` stays in `C:\project\cims_phase\` and a copy is in `docs/plan.md`. `autorun-prompt.md` stays outside the repo.
- **D4 (T0.1):** The imported web app (`apps/web/package.json`) does **not** depend on `zod`, and no file in `apps/web/src` imports it. `UI_ARCHITECTURE.md` describes Zod response validation, so the code and the document differ. This affects T1.1 step 1 ("use the same Zod major as apps/web"). See question Q2.
- **Note (T0.1):** The local Node version is v22.23.3 (npm 10.9.9). The plan targets Node 20 (`engines: >=20`). CI (T0.9) pins Node 20.

- **D5 (T0.2):** `apps/web` `tsc -b` failed with ~45 pre-existing type errors (missing `Column` import, missing `Role` tag in `baseApi.tagTypes`, `DataTable` generic `Record<string, unknown>` too strict, modal `onCreate` typed `Promise<void>`). Fixed minimally so `npm run build -w apps/web` passes (the plan's Done-when needs it): added imports, tag, `T extends object`, `Promise<unknown>`. No behaviour change.
- **D6 (T0.2):** Pre-existing errors left as is (not unrelated-fixed here): `apps/api` typecheck 67 errors (T0.5 must reach zero), `apps/api` lint 55 errors / 39 warnings, `apps/web` lint 17 errors / 2 warnings (react-hooks, no-explicit-any). `apps/api` build (tsup) and `apps/web` build pass. T0.9 CI must deal with the lint baseline (see T0.9 notes).
- Added `typecheck` script to `apps/web` (`tsc --noEmit -p tsconfig.app.json`). Root `npm install` created one root `package-lock.json`; app lockfiles removed.

- **D7 (T0.3):** Interim `apps/api/Dockerfile` uses `npm install` instead of `npm ci` because app-level lockfiles were removed in T0.2 (root lockfile only). T4.1 rewrites the Dockerfile for repo-root context with `npm ci`. Added `apps/api/.dockerignore` (excludes `.env*` except example). `MAIN_ROUTE` default in `.env.example` is `api/v1` (placeholder; real value was in the untracked local `.env`, not read). Local `.env`, `.env.dev`, `.env.prod` stay on disk, now untracked and git-ignored.
- **Parallel run (2026-11-21):** at the user's request, independent tasks run in parallel agents on disjoint directories; the parent commits per task.

- **D8 (T1.2):** Mosquitto healthcheck is `pidof mosquitto`. `mosquitto_passwd -c` fails on a pre-created bind-mounted file: README says `touch` then add users without `-c`. On Git Bash for Windows prefix docker commands with `MSYS_NO_PATHCONV=1`. Dev creds live in git-ignored `infra/dev/.dev-credentials.local`. Dev containers left running.

- **D9 (T1.1/T1.3):** Extra devDeps outside plan 4.2: `tsx`, `@types/node` (contracts; `tsx` runs `export:schema`), `@types/node` (device-sim). `tsx` was already in the API devDeps. Extras in contracts: `telemetryWireToPoint`, `ERROR_CODES`/`httpStatusFor`, socket helpers `makeEnvelope`/`deviceRoom`. `parseStatusPayload` returns null when JSON `device_id` differs from topic id. Pin `typescript ~5.9.3` and `tsup ^8.5.1`: a nested `typescript@7` broke tsup d.ts build.

- **D10 (T0.4/T0.5/T0.7):** T0.4 and T0.5 share one commit (changes interleave). New `src/createApp.ts` builds app without listen; `app.ts` is entry. ESLint `import/no-relative-parent-imports` turned off (flagged tsconfig aliases, ~53 false errors; `no-restricted-imports` still blocks `../`). Added `SUCCESS_STATUS="success"`/`FAILED_STATUS="error"` (were referenced but undefined). Master GET endpoints now return 200 not 201. `handleError` now returns `errorCode`. mongodb-memory-server downloads ~800 MB mongod once (cached). Extra deps: none beyond plan 4.2.
- **Security notes (pre-existing, not in plan scope):** `device.routes.ts`, `farm.routes.ts`, `master.routers.ts` and `/auth/me` have `authenticateToken` commented out (unauthenticated). Consumer `auth.service` signs 30-day tokens. Flag for owner before production.

- **D11 (T0.9):** `.github/workflows/ci.yml` written (npm ci, build contracts, prisma generate, lint, typecheck, test, build). No remote exists, so CI is not verified remotely. Web lint baseline (17 errors) relaxed to warnings in `apps/web/eslint.config.js` (no-explicit-any, unused-vars, react-hooks compiler rules, etc.) so CI gates on new errors; tighten later.

- **D12 (T3.1-T3.3):** T3.1-T3.3 share one commit. Real web app is smaller than `UI_ARCHITECTURE.md` (pages in `view/`, `viewmodels/`, `repository/`; no `shared/api`, no `usePaginationParams`). Details: `apiSchemas.ts` in `shared/utils/`; persist whitelist now `['ui']` (token no longer in localStorage); `RoleGuard`/`ProtectedRoute` rewritten (all listed permissions required, any listed role); `authSlice` state `{accessToken,user}`; detail route param is physical `deviceId`; old mock device repository and device pages deleted (farm mock links to `/devices/<mockId>` show "Device not found"); `relayChangeDtoSchema` defined locally in `deviceApi.ts` (contracts has none; check at T2.9); assumed API response bodies: login/refresh `{accessToken,user}` in the envelope `result`, `/user/me` user object in `result`; telemetry plain array in `result`. Socket client stops after 3 consecutive auth failures. `ledText.ts` created early (section 9 texts). Link to `/devices/:deviceId/control` is 404 until T3.4. Manual "login, hard reload" check not done (needs API): T3.8 covers it.

- **D13 (T0.6/T2.4/T2.5):** `AppError` gained optional `details`; `ValidationError(message, errorCode="VALIDATION_ERROR", details?)`. Validate issues shaped `{in,path,message,code}`; headers validated but not replaced. Dispatcher reads device type from `Device.deviceType` (cached 60 s); drops on type mismatch with topic. `MqttClient.connect()` resolves on first connect; `shutdown()` and `installShutdownHooks(after?)` exist but are NOT yet called from `app.ts`: wire in T2.6/T2.8 (`startMqtt()` after `initTimeseries()`). Empty (retained-clear) payloads reach ingest: T2.6 must treat empty status payload as no-op. `ingest.service.ts` is a stub until T2.6.
- **D14 (T2.1/T2.2):** Prisma enums written multi-line (one-line form rejected). `app.ts` has `bootstrap()` calling `initTimeseries()` before listen. Device seeding sets both `type` and `deviceType` (existing schema requires `deviceType`). Permission mapping: existing `DEVICE_READ` reused; legacy `DEVICE_CREATE/UPDATE/DELETE` kept (not equivalent to new ones); `DEVICE_MANAGE` separate. New role TECHNICIAN. VIEWER now has exactly the 6 matrix permissions (legacy `FARM_READ`, `CONSUMER_READ`, `MASTER_READ` removed from VIEWER; sync on reseed). Fixed `test/setup/mongo.ts` hang: `execFileSync` for `prisma db push` blocked mongod stdout; now async `execFile`. `BOOTSTRAP_ADMIN_PASSWORD` not in `.env.example` (add in a later task).

- **D15 (T3.4-T3.7):** One commit. `useCommandUpdates(deviceId, deviceObjectId)` takes ObjectId for REST restore. Extra UI texts beyond section 9: "Live connection lost — commands disabled", "State unknown", bulk confirm body, "Command was not sent". "Last result" on RelayCard shows SET_RELAY only; bulk result in `BulkControlBar`; bulk in flight disables all relay buttons. Date filters read the picked day as an IST day. Commands endpoint filter: status only. `VITE_FF_CIMCMS` defaults false when unset; `.env.example` sets true. `/users` guarded by roles ADMIN/SUPER_ADMIN (exact USER_* permission names unknown; TODO in code). Room label placeholder "Room: not assigned" until T5.1. Assumed API shapes: command POST returns `CommandDto` in envelope `result`; `GET /audit` same paginated envelope. `commandsSlice.byId` never pruned. `AppRoutes` exported separately from `AppRouter` for tests.

- **D16 (T2.3):** Prisma on Mongo does not match a missing field against `null`: refresh tokens are created with explicit `revokedAt: null`, `replacedByHash: null`; queries also accept `isSet:false`. `REFRESH_COOKIE_PATH` must equal the path the BROWSER sees: in the same-origin deployment (D-6) that is `/api/user/token` (Nginx/Vite proxy map `/api/*` to `/<MAIN_ROUTE>/*`); code default without the env var is `/<MAIN_ROUTE>/user/token` (direct API access only); tests use `/api/v1/user/token`. Bad/expired token now returns 401 `UNAUTHENTICATED` (was 403). Wrong password keeps the legacy `AUTHENTICATION_ERROR` code (existing test asserts it). Not done (outside plan): login timing equalisation (rate limiter only), `POST /user` still needs only `authenticateToken`, device/farm/master routes unauthenticated (pre-existing).

- **D17 (T2.6-T2.8):** One commit; T2.6 and T2.8 NEED SENIOR REVIEW (out-of-order guard, relay-diff source inference, retained-online path; submit check order, conditional transitions, ack-before-PUBLISHED race). Ingest processes each device's messages in strict arrival order via a per-device promise queue. Dispatcher type cache stores the pending promise (ordering fix). `prisma.client.ts` no longer registers SIGINT/SIGTERM (app.ts owns shutdown order; one-off scripts must call `$disconnect()` themselves). `startMqtt()` not awaited at bootstrap (API serves while broker down; commands 503). A retained status does NOT bump `lastSeenAt` (plan wording differs). Telemetry time-series point uses device `timestamp_utc`, falls back to server time if `rtc.valid` false or clock off by more than 24 h. Relay-change attribution fallback accepts any `RELAY_CHANGE_SOURCES` value and event `command_id`. `lateResult` set only by first late terminal result. In-flight limit (step 6) is check-then-create, not atomic: two concurrent requests at 3 in flight can both pass (accepted risk, device TTL bounds it). Command lists use `{data, pagination}`; POST returns 202, repeated Idempotency-Key 200. Test hooks: `CommandService.setTiming`, `CommandTimeoutJob.start({intervalMs,startDelayMs})`. Socket auth must follow any change of token claims.

- **D18 (T4.1-T4.5):** One commit. Root-context `.dockerignore` added (keeps `tools/*/package.json`). api image: `node:20` + pm2 fork mode, `USER node`; `tsup` bundles `@cimcms/contracts` (`noExternal`) and has extra entries `seed.ts`, `seed-admin.ts` (seed via `node dist/src/models/seed.js` in the container, not `npm run seed`). Dockerfile workaround: contracts built JS-only (`tsup src/index.ts --format esm --clean`) and web uses `vite build` without `tsc -b` (typecheck is done in CI). Root cause of the earlier tsup 9 / typescript 7 failure was nested lockfile entries under `packages/contracts/node_modules`; the parent removed them and `npm install` repaired the lockfile (contracts build and 37 tests verified). Mongo credentials in separate `mongo.env`; mongo keyfile prepared inside the container; nginx config is an envsubst template (`DOMAIN`, `MAIN_ROUTE`); `http2 on;`; no CSP loosening needed. Not run: certbot/Let's Encrypt, real mqtts broker, real domain, browser smoke checklist, off-server backup copy (`OFFSITE_CMD`, TODO O-13).

- **D19 (T2.9-T2.11):** One commit. `RelayChangeDto` lives in `deviceread.service.ts` (matches web `relayChangeDtoSchema`; not in contracts). `/devices` returns `state: null` for never-seen devices; name falls back to `deviceId`. `requirePermission` 403 now carries `errorCode: 'FORBIDDEN'`. Liveness job does not mark STALE while the broker never connected and for 5 s after first connect. Retention runs 02:00 IST (`RETENTION_DAYS=365`, TODO O-7). Added `@test/*` alias (tsconfig + vitest) because lint bans `../` imports. e2e simulator latency 250 ms so PUBLISHED reaches the socket before EXECUTED. No web/API shape mismatches found. T4.2 api healthcheck `/health/ready` now exists; re-verify in the T3.8 / final docker run.

- **D20 (T3.8):** `playwright.config.ts` is in `apps/web` (not `e2e/`). Uses scratch DB `cimcms_e2e` (dropped and recreated per run; refuses names not starting with `cimcms_e2e`), API on :3914, Vite on :5273. Simulator started per spec file. Login via UI in each test (refresh token rotates). Login limiter (10/15 min per email) means the admin account uses 9 logins per run: adding admin tests needs a shared session. `ignoreCommands` test takes ~20 s (no TTL env override). `.github/workflows/e2e.yml` is `workflow_dispatch` only, not run. Verified here: hard-reload session persistence (closes D12 manual check), `/health/ready` 200 with mongo+mqtt up, secret scan clean (HTML, responses, headers, WS frames, storage, cookies). Not asserted: error text on bad password (one observed `FETCH_ERROR` on cold Vite start; recheck).

## Questions for owner

- **Q1 (T0.1, for T0.3):** `apps/api/.env`, `apps/api/.env.dev` and `apps/api/.env.prod` are tracked in Git and are now also in this monorepo's history (imported by the subtree). T0.3 removes them from the index. The secrets themselves must be rotated by a person (HUMAN-ONLY). Do not push this repository to a shared remote before T0.3 and the rotation are done.
- **Q3 (T0.3, HUMAN-ONLY):** `.env` was committed to Git history. Rotate JWT_SECRET_KEY, SESSION_SECRET_KEY, DATABASE_URL credentials, CLOUD_ACCESS_KEY/CLOUD_SECRET_KEY, MAIL_PASSWORD. History still contains them (monorepo imported it with history); do not push to a shared remote until rotated.
- **Q2 (T0.1, for T1.1):** Neither `apps/web` nor `apps/api` depends on Zod today, so T1.1 step 1 ("use the same Zod major as apps/web") has no answer in the code. Which Zod major should be used (3 or 4)? Suggested default unless the owner answers: Zod 4 (current major; it has `z.toJSONSchema`, so `zod-to-json-schema` is not needed). Use the same major in `packages/contracts`, `apps/api` and `apps/web` (Zod is approved for all three in plan section 4.2).
