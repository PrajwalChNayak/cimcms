# Architecture — Cultivo IoT API

Backend REST API for an IoT / aquaculture-monitoring platform. Consumers (farm
owners) own farms, farms hold devices; a separate internal user/role/permission
system governs administrative access. Node.js + TypeScript + Express, MongoDB via
Prisma, S3-compatible object storage via MinIO.

---

## 1. Technology stack

| Concern | Choice |
| --- | --- |
| Runtime / language | Node.js 20, TypeScript 5 (ESM, `"type": "module"`) |
| HTTP framework | Express 4 |
| ORM / data access | Prisma 6 — `provider = "mongodb"` |
| Database | MongoDB (`DATABASE_URL`) |
| Object storage | MinIO client (S3-compatible) |
| AuthN | JWT (`jsonwebtoken`), 30-day access tokens |
| Password hashing | Argon2id (`argon2`), OWASP-2024 parameters |
| Hardening | `helmet` (CSP, HSTS, frameguard, referrer policy), `cors`, `express-rate-limit` |
| Logging | `winston` (colourised console transport) |
| API docs | `openapi.yaml` served through `@scalar/express-api-reference` at `/api-docs` |
| Build | `tsup` (esbuild) → `dist/`, ESM output; `tsx watch` in dev |
| Process manager | `pm2-runtime` inside the Docker runtime image |
| Lint / format | ESLint 8 + `@typescript-eslint`, Prettier |

---

## 2. Layered architecture

The codebase is a strict four-layer stack. Each layer only talks to the one
directly beneath it, and Express types stop at the controller boundary.

```
HTTP request
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  app.ts                                                             │
│  express.json → cors → /api-docs (Scalar) → /{MAIN_ROUTE} router    │
│  → request-data interceptor → rate limiter → helmet headers         │
│  → 404 catch-all → errorHandler (last)                              │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌────────────────────┐   src/routes/            path → handler wiring,
│  Routes            │   src/routes/modules/    per-route middleware chain
└────────────────────┘
    │  authenticateToken → requireRole / requirePermission
    ▼
┌────────────────────┐   src/controllers/       destructure req, call service,
│  Controllers       │                          hand result to response helper
└────────────────────┘
    │  plain values / DTO objects only
    ▼
┌────────────────────┐   src/services/          business rules, orchestration,
│  Services          │                          JWT issuing, hashing, storage
└────────────────────┘
    │
    ▼
┌────────────────────┐   src/repositories/      Prisma delegates, where-clause
│  Repositories      │                          building, pagination
└────────────────────┘
    │
    ▼
┌────────────────────┐   src/models/            PrismaClient singleton,
│  Data access       │   src/models/tables/     schema.prisma, seed.ts
└────────────────────┘
    │
    ▼
  MongoDB                                    MinIO bucket (files)
```

### Directory map

| Path | Responsibility |
| --- | --- |
| [app.ts](app.ts) | Express bootstrap, global middleware order, OpenAPI mount, listener |
| [convert.ts](convert.ts) | Standalone Postman-collection → OpenAPI 3.0 YAML generator (no third-party converter; hand-rolled YAML emitter) |
| [src/routes/index.routes.ts](src/routes/index.routes.ts) | Aggregates module routers; post-wraps every handler for async error forwarding |
| [src/routes/modules/](src/routes/modules/) | One router-registrar per domain: auth, user, farm, device, master |
| [src/controllers/](src/controllers/) | Thin HTTP adapters — static classes, no business logic |
| [src/services/](src/services/) | Domain logic; the only layer that composes multiple repositories |
| [src/repositories/](src/repositories/) | `BaseRepository` + one subclass per Prisma model |
| [src/models/prisma.client.ts](src/models/prisma.client.ts) | PrismaClient singleton, query logging, graceful shutdown |
| [src/models/tables/schema.prisma](src/models/tables/schema.prisma) | Data model (source of truth for the DB) |
| [src/models/seed.ts](src/models/seed.ts) | Seeds system permissions, roles, and role-permission grants |
| [src/middleware/](src/middleware/) | JWT auth, RBAC guards, multipart parsing, central error handler |
| [src/security/](src/security/) | Rate limiter, request/query sanitiser, session config (currently unmounted) |
| [src/utils/](src/utils/) | Response envelope, pagination, Argon2, logger, constants, config, file helpers |
| [src/types/express.d.ts](src/types/express.d.ts) | Augments `Express.Request` with `user` and `subject` |

### Path aliases

`tsconfig.json` defines `@/*`, `@controllers/*`, `@middleware/*`, `@models/*`,
`@repositories/*`, `@routes/*`, `@security/*`, `@services/*`, `@utils/*` — all
mapped under `./src/`. tsup/esbuild resolves these natively at build time, so no
runtime path-resolution shim is needed.

---

## 3. Request lifecycle

1. **Parse & CORS** — `express.json()`, then permissive `cors()`.
2. **Docs** — `/api-docs` renders `openapi.yaml` through Scalar; the `servers`
   block is rewritten at boot to `http://localhost:${PORT}/${MAIN_ROUTE}`.
3. **Domain router** — everything else is mounted under `/${MAIN_ROUTE}`.
4. **Route-level middleware** — `authenticateToken` on every route except
   `POST /auth/register`, `POST /auth/login`, `POST /user/login`; then optional
   `requireRole(...)` / `requirePermission(...)`.
5. **Controller** → **Service** → **Repository** → Prisma → MongoDB.
6. **Response** — controllers call a helper from
   [index.utils.ts](src/utils/responsehandler/index.utils.ts), which wraps the
   payload in a `ResponseEntity`.
7. **Errors** — anything thrown propagates to
   [errorhandler.middleware.ts](src/middleware/errorhandler.middleware.ts).
8. **Unmatched paths** — `app.all('*')` raises `NotFoundError`.

### Async error propagation

Two mechanisms cover it:

- `express-async-errors` is imported in `app.ts`, patching Express 4's router to
  forward rejected promises.
- [index.routes.ts](src/routes/index.routes.ts) additionally walks
  `apiRoutes.stack` after registration and re-wraps each handler in a
  `Promise.resolve(fn(...)).catch(next)` shim — so handlers stay `async` without
  per-route `try/catch`.

**Middleware-order caveat:** the domain router is mounted *before*
`requestInterceptorDataValidation`, `limiter`, and the `helmet` header
middleware. As written, those three only apply to requests that fall through to
the 404 handler — API routes are neither rate-limited, query-sanitised, nor sent
the CSP/HSTS headers. Moving those `app.use` calls above the
`app.use('/'+MAIN_ROUTE, apiRoute)` line would apply them to the API surface.

---

## 4. Data model

MongoDB via Prisma. All ids are `String @db.ObjectId` mapped from `_id`, and all
models carry `createdAt` / `updatedAt`.

```
                       ┌──────────────┐
                       │     User     │  internal/admin account
                       └──────┬───────┘
                              │ 1..n
                       ┌──────▼───────┐
                       │   UserRole   │  junction
                       └──────┬───────┘
                              │ n..1
                       ┌──────▼───────┐
                       │     Role     │  name unique, isSystem flag
                       └──────┬───────┘
                              │ 1..n
                    ┌─────────▼──────────┐
                    │   RolePermission   │  junction
                    └─────────┬──────────┘
                              │ n..1
                       ┌──────▼───────┐
                       │  Permission  │  name unique, isSystem flag
                       └──────────────┘

  ┌────────────┐ 1      n ┌────────┐ 1      n ┌────────┐
  │  Consumer  ├──────────┤  Farm  ├──────────┤ Device │
  └─────┬──────┘          └────────┘          └───▲────┘
        │ 1                                     n │
        └──────────────────────────────────────────┘
              (Device.consumerId — denormalised owner link)

  ┌──────────────────────┐
  │  MasterTypeConstant  │  type + value + info(Json) — generic lookup table
  └──────────────────────┘
```

| Model | Notes |
| --- | --- |
| `User` | `email` unique, Argon2 password, `status: CommonStatus`, roles via `UserRole` |
| `Role` / `Permission` | `name` unique; `isSystem` protects seeded records from deletion (`assertNotSystem`) |
| `UserRole` / `RolePermission` | Explicit junction models (Mongo has no implicit m:n join table) |
| `Consumer` | Public/end-user identity — a credential store entirely separate from `User`; has `mobileNumber`, `profileImageUrl`, `lastLogin` |
| `Farm` | Belongs to one `Consumer`, holds many `Device` |
| `Device` | `deviceId` unique (physical hardware id); `consumerId`/`farmId` both optional so a device can be pre-registered before assignment |
| `MasterTypeConstant` | Type/value dictionary for dropdowns and enum-like config, with a free-form `info` JSON payload |
| `CommonStatus` | `ACTIVE`, `INACTIVE`, `DELETED`, `BLOCK` — the basis for soft deletes |

`schema.prisma` lives at `src/models/tables/schema.prisma` (declared under the
`prisma` key in `package.json`, not the default location).

---

## 5. Repository pattern

[BaseRepository](src/repositories/base.repository.ts) is a static base class
providing the whole data-access surface. Subclasses declare only metadata:

```ts
class DeviceRepository extends BaseRepository {
  static override _modelName = 'device';                 // Prisma delegate key
  static override _fieldMappings: FieldMappings = {      // search semantics
    exact: ['consumerId', 'farmId'],
    text:  ['name', 'type', 'location', 'deviceId'],
    date:  ['createdAt', 'updatedAt'],
  };
  static override _defaultWhere = {};                    // opt out of soft-delete filter
}
```

**Provided operations:** `create`, `createMany`, `createManySkipDuplicates`,
`exists`, `existsById`, `findById`, `findOne`, `findAll`, `findAllMongo`,
`findAllWithoutPagination`, `updateById`, `softDelete`, `deleteById`,
`bulkDeleteByIds`, `toggleStatus`, `count`, `transaction`.

**Key mechanics**

- *Delegate memoisation* — `getDelegate()` caches the `prisma[modelName]` lookup
  in a module-level `Map`, so the cast happens once per model.
- *Declarative filtering* — `_buildWhere` walks `_fieldMappings` in a single pass
  and emits a Prisma `where`: `exact` / `numeric` / `date` clauses go into `AND`,
  `text` clauses (case-insensitive `contains`) into `OR`, giving free-text search
  across the declared fields. `'true'` / `'false'` strings are coerced to
  booleans; a bare `YYYY-MM-DD` date expands to a full-day range.
- *Soft-delete default* — `_defaultWhere = { status: { not: 'DELETED' } }` is
  applied unless a subclass or call site overrides it. Models without a `status`
  field (`Device`, `Farm`, both junctions, `MasterTypeConstant`) override it
  to `{}`.
- *`findAllMongo` escape hatch* — runs `aggregateRaw` instead of the typed API.
  It compares `exact` fields with
  `{ $expr: { $eq: [{ $toString: '$field' }, value] } }`, which matches documents
  whose id is stored as either a BSON `ObjectId` or a plain string — the
  type-mismatch case Prisma's typed queries cannot express. A default
  `$addFields` / `$project` stage stringifies `_id` into `id` and serialises
  ObjectId and date fields.
- *Pagination* — every list method returns
  `PaginationResult<T> = { data, pagination: { total, page, limit, totalPages } }`,
  computed by [PaginationUtils](src/utils/pagination.utils.ts). Count and page
  fetch run concurrently via `Promise.all`.

Subclasses add only model-specific queries: `UserRepository.findByEmail` /
`findWithRoles`, `RoleRepository.findWithPermissions` / `assertNotSystem`,
`UserRoleRepository.assign` / `revoke` / `findByUserId`,
`RolePermissionRepository.assign` / `revoke` / `findByRoleId`,
`MasterTypeConstantRepository.findDistinctTypes`.

### Prisma client lifecycle

[prisma.client.ts](src/models/prisma.client.ts) exports a singleton. In
non-production it is cached on `global.prisma` so `tsx watch` reloads don't leak
connections, and `query` / `info` / `warn` / `error` events are piped into
winston. `SIGINT` / `SIGTERM` trigger `$disconnect()` before exit.

---

## 6. Authentication & authorization

Two independent identity domains share one JWT mechanism:

| Domain | Model | Register / Login | Token claims |
| --- | --- | --- | --- |
| Consumer (public) | `Consumer` | `POST /auth/register`, `POST /auth/login` | `{ email, userId }` |
| Internal user (admin) | `User` | `POST /user/login` | `{ userId, email, roles[], permissions[] }` |

**Flow**

1. Passwords are hashed with Argon2id
   ([argon.utils.ts](src/utils/argon.utils.ts)); cost parameters come from
   `ARGON2_*` env vars and default to the OWASP-2024 values (64 MB memory,
   3 iterations, 4 lanes, 32-byte output). `needsRehash()` is available for
   post-login parameter upgrades.
2. `UserService.login` resolves the user's roles and, for each role, its
   permissions — deduplicated through a `Set` — and **bakes both arrays into the
   JWT**. Authorization is therefore a pure in-token check with no per-request DB
   round-trip; the trade-off is that role or permission changes only take effect
   after the user re-authenticates (tokens live 30 days).
3. [authenticateToken](src/middleware/auth.middleware.ts) reads
   `Authorization: Bearer <jwt>` (bare tokens also accepted), verifies against
   `JWT_SECRET_KEY`, and attaches the decoded payload to `req.subject`.
4. [permission.middleware.ts](src/middleware/permission.middleware.ts) exposes
   two factory guards reading only from `req.subject`:
   - `requirePermission(...names)` — user must hold **all** listed permissions.
   - `requireRole(...names)` — user must hold **at least one** listed role.

   Currently `requireRole('SUPER_ADMIN')` guards the `/user` CRUD and
   role-assignment routes; the permission guard is implemented but not yet wired
   into any route.
5. [express.d.ts](src/types/express.d.ts) declares `req.user` and `req.subject`
   so guards and controllers stay type-safe.

Seeded RBAC ([seed.ts](src/models/seed.ts)) defines `USER_*`, `ROLE_*`, and
`PERMISSION_*` as system permissions and `FARM_*`, `DEVICE_*` as non-system, then
creates the roles and their grants.

---

## 7. Cross-cutting concerns

### Response envelope

Every response — success and failure — is a `ResponseEntity`:

```json
{ "result": null, "statusCode": 200, "status": "success", "message": "…" }
```

[index.utils.ts](src/utils/responsehandler/index.utils.ts) provides the
intent-named helpers controllers use: `handleSuccess`, `handleDataCreation`
(201), `handleDataRetrieval`, `handleDataNotCreation`, `handleNotFound`,
`handleBadRequest`, `handleUnauthorized`, `handleError`, `handleLogin`,
`handleCustomResponse`. Status codes and all user-facing strings come from
[constant.utils.ts](src/utils/constant.utils.ts) — no literals at call sites.

### Error handling

`AppError(message, statusCode, errorCode)` is the base operational error, with
`ValidationError` (400), `AuthenticationError` (401), and `NotFoundError` (404)
subclasses ([custom.errors.ts](src/utils/errors/custom.errors.ts)). Services
throw these; the controller layer never catches.

[errorhandler.middleware.ts](src/middleware/errorhandler.middleware.ts) is a
single terminal handler whose `errorMapper` normalises everything into an
`AppError`:

- All Prisma error classes — `P2000`–`P2034` mapped to human-readable messages
  with the offending field extracted from `err.meta.target` (falling back to a
  guess from the request body); `P2002 → 409`, `P2025 → 404`, `P2024 → 503`.
- `PrismaClientValidationError` message text parsed for unknown / missing /
  invalid arguments.
- JWT errors (`JsonWebTokenError`, `TokenExpiredError`, `NotBeforeError`) → 401.
- Multer `LIMIT_*` codes → 400 with a specific message.
- Raw driver strings (`Duplicate entry`, FK constraint, `Data too long`, …) and
  `ER_*` MySQL codes parsed by `parseDatabaseError`.
- Node/network codes (`ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, …) → 503/504.
- Body-parser types (`entity.too.large` → 413, charset/encoding → 415).
- MinIO codes (`NoSuchBucket` / `NoSuchKey` → 404, `AccessDenied` → 403).
- Built-in `TypeError`, `ReferenceError`, `RangeError`, `URIError`.

5xx are logged at `error` with a stack, 4xx at `warn`, each with
`{ path, method, ip, userId, time }`. In production the response carries only
`{ success, statusCode, message, errorCode }`; outside production `stack`,
`details`, and `originalError` are appended.

### Security middleware

- [limiter.security.ts](src/security/limiter.security.ts) — 100 requests per IP
  per 10-minute window.
- [requestinterceptordatavalidation.security.ts](src/security/requestinterceptordatavalidation.security.ts) —
  rejects URLs containing `%` or `script`, and query values outside
  `[a-zA-Z0-9\s_@.-]` or containing `--` (SQL-comment guard).
- `helmet` — CSP (`default-src 'self'`, no `object-src` / `frame-src`), HSTS
  (2 years, includeSubDomains, preload), `X-Content-Type-Options`,
  `frameguard: deny`, `Referrer-Policy: same-origin`.
- [session.security.ts](src/security/session.security.ts) — `express-session`
  config exists but its `app.use` is commented out; the API is stateless.

See the middleware-order caveat in §3 — the first three currently sit after the
API router.

### File upload pipeline

[fileuploader.middleware.ts](src/middleware/fileuploader.middleware.ts) splits
parsing from storage so Express types never reach the service layer:

1. `parseMultipart` — a module-level `multer.any()` with `memoryStorage`, a
   `MAX_FILE_SIZE` limit, and an extension allow-list from `ALLOWED_EXTENSIONS`;
   buffers land on `req.files`.
2. `uploadFilesToStorage(rawFiles, fieldConfigs)` — called *from the service*.
   Files are grouped into a fieldname-keyed `Map` (O(1) lookups instead of
   repeated `filter`), required / `maxCount` rules validated in one pass, then all
   fields uploaded concurrently. Object keys are
   `folderName/[ownerId/]uuid_originalName`; a failed `putObject` removes the
   orphan before re-throwing.

A single module-level `MinioClient` shares one connection pool process-wide.
[filedelete.utils.ts](src/utils/filedelete.utils.ts) removes objects;
[FileProcess.ts](src/utils/FileProcess.ts) parses uploaded CSV (`csv-parser` over
a `PassThrough` stream) and XLSX (`xlsx`) buffers into row objects for bulk
import.

### Logging & configuration

[logger.utils.ts](src/utils/logger.utils.ts) — winston, `info` level, colourised
console output, timestamp + level + message with any metadata pretty-printed.
[config.utils.ts](src/utils/config.utils.ts) centralises typed reads of the
`CLOUD_*` and file-upload env vars; other modules read `process.env` directly.

---

## 8. API surface

All routes are prefixed with `/${MAIN_ROUTE}`. 🔓 = public, 🔒 = requires a valid
JWT, 👑 = additionally requires the `SUPER_ADMIN` role.

**Auth (consumers)** — [auth.routes.ts](src/routes/modules/auth.routes.ts)

| Method | Path | Access |
| --- | --- | --- |
| POST | `/auth/register` | 🔓 |
| POST | `/auth/login` | 🔓 |
| GET | `/auth/token/refresh` | 🔒 |
| GET | `/auth/me` | 🔒 |

**Users, roles & permissions** — [user.routes.ts](src/routes/modules/user.routes.ts)

| Method | Path | Access |
| --- | --- | --- |
| POST | `/user/login` | 🔓 |
| POST / GET / PUT | `/user/role`, `/user/role/:id`, `/user/role/toggle/:id` | 🔒 |
| POST / GET / PUT | `/user/permission`, `/user/permission/:id`, `/user/permission/toggle/:id` | 🔒 |
| POST / DELETE | `/user/role/permission` | 🔒 |
| POST | `/user` | 🔒 |
| GET / PUT / DELETE | `/user`, `/user/:id` | 👑 |
| POST / DELETE | `/user/assign/role`, `/user/revoke/role` | 👑 |
| POST | `/user/reset-password` | 🔒 |

**Farms** — [farm.routes.ts](src/routes/modules/farm.routes.ts)

| Method | Path | Access |
| --- | --- | --- |
| POST | `/farms` | 🔒 |
| GET | `/farms/consumer` | 🔒 |
| GET / PUT / DELETE | `/farms/:id` | 🔒 |

**Devices** — [device.routes.ts](src/routes/modules/device.routes.ts)

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| POST | `/devices/register` | Pre-register hardware (`deviceId` + `deviceType`, unassigned) | 🔒 |
| POST | `/devices/farmer` | Claim/assign a registered device to a consumer + farm | 🔒 |
| GET | `/devices/consumer` | Paginated list, filterable by name / type / location / deviceId / farmId | 🔒 |
| GET / PUT / DELETE | `/devices/:id` | Single-device read, update, hard delete | 🔒 |

**Master data** — [master.routers.ts](src/routes/modules/master.routers.ts)

| Method | Path | Access |
| --- | --- | --- |
| POST / GET | `/master/constant` | 🔒 |
| GET | `/master/constant/types` | 🔒 |

Note the two-step device provisioning: `/devices/register` creates the record
keyed by the physical `deviceId`, and `/devices/farmer` later looks that record up
and attaches `consumerId` / `farmId` — which is why both foreign keys are optional
in the schema.

---

## 9. API documentation workflow

`openapi.yaml` (~300 KB) is the served contract. It is generated from a Postman
collection by [convert.ts](convert.ts) — a self-contained converter with its own
minimal YAML emitter, no third-party conversion dependency. It ships as a second
tsup entry point, so it can be run with `tsx convert.ts` in dev or
`node dist/convert.js` after a build. `app.ts` loads the YAML with `yamljs`,
rewrites the `servers` block to the local URL, and hands it to Scalar at
`/api-docs`.

---

## 10. Build, run & deploy

**Scripts** (`package.json`)

| Script | Action |
| --- | --- |
| `npm run dev` | `tsx watch app.ts` — hot reload |
| `npm run build` / `build:clean` | `tsup` → `dist/` (ESM, sourcemaps, no splitting) |
| `npm start` | `node dist/app.js` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run gp` | `prisma generate` |
| `npm run db:pull` / `db:push` | Introspect / push schema, then regenerate |
| `npm run seed` | `tsx src/models/seed.ts` — RBAC seed data |
| `npm run prisma:studio` / `prisma:format` | Prisma tooling |
| `npm run lint` / `lint:fix` | ESLint |

**Docker** ([Dockerfile](Dockerfile)) — two stages on `node:20`:

1. *builder* — `npm ci`, `prisma generate`, `tsup` build.
2. *runner* — installs `pm2` globally and copies only `dist/`, `node_modules`,
   `package.json`, `openapi.yaml`, and `.env`. Exposes `3814`, starts with
   `pm2-runtime dist/app.js`.

**Environment** — `.env`, `.env.dev`, `.env.prod`

| Group | Variables |
| --- | --- |
| Runtime | `NODE_ENV`, `PORT`, `MAIN_ROUTE` |
| Secrets | `JWT_SECRET_KEY`, `SESSION_SECRET_KEY` |
| Database | `DATABASE_URL`, `DB_DIALECT` |
| Mail | `MAIL_DRIVER`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD` |
| Object storage | `CLOUD_ENDPOINT`, `CLOUD_PORT`, `CLOUD_USE_SSL`, `CLOUD_ACCESS_KEY`, `CLOUD_SECRET_KEY`, `CLOUD_BUCKET_NAME`, `USER_FOLDER` |
| Uploads | `MAX_FILE_SIZE`, `ALLOWED_EXTENSIONS` |
| Crypto | `ARGON2_MEMORY_COST`, `ARGON2_TIME_COST`, `ARGON2_PARALLELISM`, `ARGON2_HASH_LENGTH` |

`.env` is currently committed to the repo and copied into the runtime image — for
production these values belong in the orchestrator's secret store instead.

---

## 11. Conventions

- **Static classes over instances.** Controllers, services, and repositories are
  all static-method classes with a default export; nothing is instantiated.
- **One module per domain per layer.** `device.routes.ts` →
  `device.controller.ts` → `device.service.ts` → `device.repository.ts`.
- **Express types stop at controllers.** Services receive primitives and plain
  objects; `uploadFilesToStorage` takes `Express.Multer.File[]` explicitly rather
  than a `Request`.
- **No `try/catch` in controllers.** Throw an `AppError` subclass; the terminal
  handler formats it.
- **No inline strings or status codes.** Everything comes from `Constants`.
- **Path aliases, not `../../`.** Import via `@services/…`, `@utils/…`, etc.
- **Soft delete by default.** Set `status = 'DELETED'` / `'INACTIVE'` rather than
  removing documents, unless the model opts out with `_defaultWhere = {}`.
- **Search declared, not written.** Add fields to `_fieldMappings`; the base
  repository builds the query.

---

## 12. Known gaps

Flagged for anyone extending the codebase — these are observations from reading
the current tree, not a task list:

- **Middleware order** — rate limiter, query sanitiser, and helmet headers are
  registered after the API router, so they don't apply to API routes (§3).
- **`ConsumerRepository._modelName = "Consumer"`** is PascalCase while every
  other repository uses the camelCase Prisma delegate key (`'user'`, `'device'`,
  `'farm'`, …). `prisma['Consumer']` is `undefined`, so consumer queries through
  the base repository resolve to no delegate.
- **`id` typing** — `BaseRepository.updateById` / `deleteById` / `softDelete` are
  typed `id: number`, a leftover from the MySQL-era schema. Mongo ids are
  strings, so services cast with `id as unknown as number`. Retyping the base
  signatures to `string` would remove the casts across every service.
- **`BaseRepository.db` is `private`** yet accessed as `this.db` from
  `UserRepository`, `RoleRepository`, and both junction repositories — subclasses
  cannot see a `private` member in TypeScript, so `protected` is the intended
  modifier.
- **No request-body validation layer** — controllers destructure `req.body`
  directly; malformed input surfaces as a Prisma error mapped by the error
  handler rather than a validation failure at the edge.
- **`AuthService` throws bare `Error`** — those land as 500s instead of the 401
  an `AuthenticationError` would produce; `UserService.login` has the same
  pattern.
- **Stale token claims** — roles and permissions are frozen into 30-day JWTs, so
  privilege changes require re-login (§6). A `loadUserPermissions` middleware is
  referenced in `permission.middleware.ts` docblocks but not implemented.
- **`ConsumerRepository._fieldMappings`** still lists MySQL-era snake_case
  columns (`emp_code`, `doj`, `created_by`, …) that don't exist on the Mongo
  `Consumer` model.
- **`DeviceService.getDevicesByConsumerId`** declares the required parameter
  `consumerId` after optional ones, which is not valid TypeScript.
- **`README.md` describes the Arduino firmware side** of the product, not this
  API service.
- **Leftover debug output** — `console.log` calls in `permission.middleware.ts`,
  `auth.controller.ts`, and `device.service.ts`.
