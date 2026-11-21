# CIMCMS

Mushroom cultivation management platform. LED Controller MVP (simulation mode first),
built by extending the existing Cultivo IoT API and React web app.

## Layout

| Path | What it is |
| --- | --- |
| `apps/api` | Existing Cultivo IoT API (Express + Prisma + MongoDB), imported with history |
| `apps/web` | Existing React web app (Vite + Redux Toolkit), imported with history |
| `packages/contracts` | Shared Zod schemas, constants and topic helpers (planned) |
| `tools/device-sim` | LED controller MQTT simulator (planned) |
| `infra/` | Dev and production infrastructure (planned) |
| `docs/` | Plan, source requirements, progress and runbooks |

See `docs/plan.md` for the implementation plan and `docs/PROGRESS.md` for task status.
