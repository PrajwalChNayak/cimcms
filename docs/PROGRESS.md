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
| T0.6 | API: request ID and Zod validation middleware | todo | | | |
| T0.7 | API: test setup | done | 2026-11-21 | see `git log --grep T0.7` | 5/5 tests, no Docker |
| T0.8 | Web: test setup | done | 2026-11-21 | 7499d64 | `npm test -w apps/web` 1/1 pass |
| T0.9 | CI | todo | | | |
| T1.2 | Dev infrastructure (Docker Compose) | done | 2026-11-21 | d1e8aa3 | rs0 ok; ACL verified; Prisma connect not tested; see D8 |
| T1.3 | Device simulator tools/device-sim | done | 2026-11-21 | see `git log --grep T1.3` | 14/14 tests; manual run vs dev broker not done; see D9 |
| T2.1 | Prisma models and time-series init | todo | | | |
| T2.2 | RBAC and device seed | todo | | | |
| T2.3 | Auth: short access token, refresh cookie, /user/me | todo | | | Needs senior review |
| T2.4 | Device driver registry (API side) | todo | | | |
| T2.5 | MQTT client and dispatcher | todo | | | |
| T2.6 | Ingest service and device state | todo | | | Needs senior review |
| T2.7 | Realtime gateway (Socket.IO) | todo | | | |
| T2.8 | Command service, routes, timeout job | todo | | | Needs senior review |
| T2.9 | Device read endpoints | todo | | | |
| T2.10 | Health, liveness job, retention job | todo | | | |
| T2.11 | Backend end-to-end test | todo | | | |
| T3.1 | Auth: internal user login + refresh flow | todo | | | |
| T3.2 | Realtime client | todo | | | |
| T3.3 | Devices feature on real API with live state | todo | | | |
| T3.4 | LED control feature | todo | | | |
| T3.5 | Dashboard | todo | | | |
| T3.6 | History pages | todo | | | |
| T3.7 | Navigation and permission gating | todo | | | |
| T3.8 | Playwright end-to-end acceptance tests | todo | | | |
| T4.1 | Dockerfiles | todo | | | |
| T4.2 | Production compose and Nginx | todo | | | |
| T4.3 | Mosquitto hardening runbook | todo | | | HUMAN-ONLY execution; needs senior review |
| T4.4 | Backup and restore | todo | | | |
| T4.5 | Deploy runbook | todo | | | MVP complete after this task |
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

## Questions for owner

- **Q1 (T0.1, for T0.3):** `apps/api/.env`, `apps/api/.env.dev` and `apps/api/.env.prod` are tracked in Git and are now also in this monorepo's history (imported by the subtree). T0.3 removes them from the index. The secrets themselves must be rotated by a person (HUMAN-ONLY). Do not push this repository to a shared remote before T0.3 and the rotation are done.
- **Q3 (T0.3, HUMAN-ONLY):** `.env` was committed to Git history. Rotate JWT_SECRET_KEY, SESSION_SECRET_KEY, DATABASE_URL credentials, CLOUD_ACCESS_KEY/CLOUD_SECRET_KEY, MAIL_PASSWORD. History still contains them (monorepo imported it with history); do not push to a shared remote until rotated.
- **Q2 (T0.1, for T1.1):** Neither `apps/web` nor `apps/api` depends on Zod today, so T1.1 step 1 ("use the same Zod major as apps/web") has no answer in the code. Which Zod major should be used (3 or 4)? Suggested default unless the owner answers: Zod 4 (current major; it has `z.toJSONSchema`, so `zod-to-json-schema` is not needed). Use the same major in `packages/contracts`, `apps/api` and `apps/web` (Zod is approved for all three in plan section 4.2).
