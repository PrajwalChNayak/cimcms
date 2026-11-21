# Architecture Guide — QMS

> Last reviewed: scaffolded by scaffold-new-project.sh (hardened edition)

---

## Table of Contents

1. [Philosophy](#1-philosophy)
2. [Folder Structure](#2-folder-structure)
3. [Layer Responsibilities](#3-layer-responsibilities)
4. [Data Flow](#4-data-flow)
5. [State Management](#5-state-management)
6. [API Layer](#6-api-layer)
7. [Authentication & Security](#7-authentication--security)
8. [Routing & Guards](#8-routing--guards)
9. [Forms & Validation](#9-forms--validation)
10. [Error Handling Strategy](#10-error-handling-strategy)
11. [Adding a New Feature — Step-by-Step](#11-adding-a-new-feature--step-by-step)
12. [Environment Configuration](#12-environment-configuration)
13. [Feature Flags](#13-feature-flags)
14. [Performance Conventions](#14-performance-conventions)
15. [Known Limitations & Roadmap](#15-known-limitations--roadmap)

---

## 1. Philosophy

This project uses a **hybrid architecture**:

- **Feature-based** for business domains (auth, dashboard, sensors, …).
  Everything related to a feature lives together — API slice, store slice,
  components, hooks, types and schemas.

- **Layer-based** for shared infrastructure (api, store, layouts, router,
  utils). These have no business logic and are consumed by all features.

### Core Rules

| Rule | Rationale |
|------|-----------|
| Features are self-contained. | Deleting a folder deletes the feature with zero side-effects. |
| Features expose a public `index.ts` barrel. | Callers outside the feature import only from the barrel, never from internal paths. |
| `shared/` has no imports from `features/`. | Shared code must be generic and reusable. |
| `store/` holds only infrastructure. | Slice files live in their feature folder. |
| No circular imports. | See "Breaking cycles" below. |
| `RootState` has one source of truth. | Exported only from `src/store/store.ts`. |

### Sanctioned exceptions

Two files sit at the **composition root** and must reference features by
design. Nothing else in `shared/` or `store/` may import from `features/`:

| File | Why |
|------|-----|
| `shared/router/AppRouter.tsx` | Lazy-imports each route component **from its own module**, not the feature barrel — importing the barrel would pull the whole feature into the entry chunk and defeat code splitting. |
| `shared/components/AppInitializer.tsx` | Boots the session via the auth feature's `/auth/me` query. |
| `store/rootReducer.ts` | Assembles feature reducers; imports them from each feature's barrel. |

Because of the first point, **route-level page components are not exported
from their feature barrel** — only hooks, store, api, schemas, types and
reusable (non-route) components are.

### Breaking cycles

Two features that both need each other's data would make their barrels
cyclic. The rule that avoids this:

> A feature may import another feature's **barrel** only in one direction.
> For the reverse direction, read the other slice's state through a
> `RootState`-typed selector — a type-only dependency that erases at runtime.

Concretely: `farms` imports `@features/devices` (it renders `DeviceCard`),
so `devices` never imports `@features/farms` — `useDevices` reads farm names
via `(state: RootState) => state.farms.items` instead. Likewise
`selectFarmSummaries` derives device counts straight off `RootState`.

`eslint-plugin-import/no-cycle` is **not installed**, so this rule is
convention-enforced rather than machine-checked (see §15).

---

## 2. Folder Structure

```
src/
├── config/
│   ├── constants.ts       Named constants (API tuning, pagination, routes, keys)
│   ├── env.ts             Typed env config; throws in prod if VITE_API_BASE_URL missing
│   └── features.ts        Feature flags driven by VITE_FF_* env vars
│
├── features/              One folder per business domain
│   ├── auth/
│   │   ├── api/authApi.ts               RTK Query endpoints + Zod response validation
│   │   ├── components/LoginPage.tsx     Route-level view (no logic)
│   │   ├── hooks/                       useLogin (form + mutation + nav), useAuth
│   │   ├── mocks/authMocks.ts
│   │   ├── schemas/auth.schemas.ts      Zod — form resolver + response validation
│   │   ├── store/authSlice.ts           Slice + RootState-typed selectors
│   │   ├── types/auth.types.ts
│   │   └── index.ts                     Public barrel
│   │
│   ├── dashboard/         components/ hooks/ (useDashboard aggregates other features)
│   ├── devices/           api/ components/ hooks/ mocks/ schemas/ store/ types/
│   ├── farms/             api/ components/ hooks/ mocks/ schemas/ store/ types/
│   ├── masterTypeConstant/ api/ components/ hooks/ schemas/ types/
│   ├── settings/          components/ hooks/
│   └── users/             api/ components/ hooks/ schemas/ types/  (roles + permissions)
│
├── shared/
│   ├── api/
│   │   ├── apiSchemas.ts        Zod envelope helpers + parseResponse
│   │   └── baseApi.ts           RTK Query base: retry, reauth, global settings
│   ├── components/
│   │   ├── AppInitializer.tsx   Boot-time session validation
│   │   ├── loading/             Spinner, skeletons, full-screen loader
│   │   ├── notifications/       NotificationBell (header alert chrome)
│   │   ├── splash/              Splash screen
│   │   ├── toast/               ToastContainer + useToastManager
│   │   └── ui/                  Button, Input, DataTable, Modal, SearchInput, StatCard
│   ├── hooks/
│   │   └── usePaginationParams.ts  Page + server-filter state for list screens
│   ├── layouts/                 AuthLayout, DashboardLayout, PublicLayout
│   ├── mocks/                   Seed fixtures for cross-cutting slices
│   ├── router/                  AppRouter, ProtectedRoute, PublicRoute, RoleGuard, routes
│   ├── utils/                   ColorConstant, ErrorBoundary, errorUtils, logger
│   └── views/errors/            404, 403, 500 pages
│
├── store/
│   ├── middleware/index.ts      errorMiddleware (rejections → toast), performanceMiddleware
│   ├── slices/                  toastSlice, uiSlice, notificationsSlice (cross-cutting only)
│   ├── hooks.ts                 useAppDispatch, useAppSelector
│   ├── index.ts                 Re-exports for external consumers
│   ├── rootReducer.ts           combineReducers (no RootState export)
│   └── store.ts                 configureStore + RootState + AppDispatch
│
├── types/
│   ├── api.types.ts             Global API shapes (ApiResponse, ApiError, PaginatedResponse)
│   ├── notification.types.ts    Alert notification shape
│   └── index.ts
│
├── App.tsx                      AppInitializer > AppRouter + ToastContainer
├── index.css                    Tailwind import
└── main.tsx                     React root mount with Provider + PersistGate
```

### Path Aliases

| Alias | Resolves to |
|-------|-------------|
| `@/*` | `src/*` |
| `@config/*` | `src/config/*` |
| `@features/*` | `src/features/*` |
| `@shared/*` | `src/shared/*` |
| `@store/*` | `src/store/*` |
| `@appTypes/*` | `src/types/*` |

## 3. Layer Responsibilities

### `features/<domain>/api/`
- RTK Query endpoint definitions using `baseApi.injectEndpoints`.
- Each endpoint uses `transformResponse` with a **Zod schema** for runtime validation.
- Never put business logic here — only HTTP wiring.

### `features/<domain>/hooks/`
- Custom hooks combining API calls, dispatch, navigation, and form state.
- Return only what the component needs; keep hooks focused.

### `features/<domain>/store/`
- Redux slice: state shape, reducers, `extraReducers` for RTK Query matchers.
- All selectors live here. Use `createSelector` for any derived value.

### `features/<domain>/schemas/`
- Zod schemas serving double duty:
  1. Runtime API response validation (via `transformResponse`).
  2. Form validation (via `@hookform/resolvers/zod`).

### `features/<domain>/components/`
- Pure views. A component reads what its feature hook returns and renders it;
  filtering, aggregation and mutation logic belong in the hook.
- Route-level pages are **not** exported from the barrel (see §1).

### `shared/api/baseApi.ts`
- Single `createApi` instance. Handles auth header, 401 → logout, retry.
- Do **not** import from any feature here (circular dep risk). The 401 handler
  dispatches `{ type: "auth/logout" }` as a plain string action for this reason.

### `shared/api/apiSchemas.ts`
- Zod helpers for the `{ statusCode, message, result }` envelope every endpoint
  returns, plus `parseResponse`, which converts a schema mismatch into a
  readable `Error` instead of an undefined-property crash in a component.
- Validation is strict on `result` and tolerant on transport metadata.

### `shared/hooks/`
- Generic, business-logic-free hooks shared by feature hooks —
  currently `usePaginationParams` (page + server-filter state for list screens).

### `store/store.ts`
- The **only** file that exports `RootState` and `AppDispatch`.
- Persist whitelist: `['ui']` only — auth token never in localStorage.

---

## 4. Data Flow

```
User Action
    │
    ▼
Component (view only — no logic)
    │
    ▼
Feature Hook  (useLogin, useDashboard, …)
    │         ├─ dispatches actions to Redux slices
    │         └─ calls RTK Query mutations / queries
    ▼
RTK Query Endpoint  (authApi, sensorApi, …)
    │         ├─ injects auth header via baseApi.prepareHeaders
    │         └─ validates response shape with Zod
    ▼
REST API  (backend)
    │
    ▼
RTK Query Cache  → Redux Store → Selectors → Components re-render
```

---

## 5. State Management

### Slice Ownership

| Slice | Owner |
|-------|-------|
| `auth` | `features/auth/store/authSlice.ts` |
| `farms` | `features/farms/store/farmsSlice.ts` |
| `devices` | `features/devices/store/devicesSlice.ts` |
| `ui`, `toast`, `notifications` | `store/slices/` — cross-cutting app chrome, not a business domain |

### Selector Rules
- All selectors typed against `RootState`.
- Use `createSelector` for derived values or anything returning an object/array.
- Never compute arrays inline in `useAppSelector` — creates new references each render.
- Derive, don't store: `FarmSummary` (a farm plus its device counts) is a
  `createSelector` over `state.farms` and `state.devices`, not slice state.

### What Is Persisted
Only `ui` state is persisted. Auth token lives in memory only and is
validated on boot via `AppInitializer` → `/auth/me`.

> **Consequence:** with no HttpOnly refresh cookie on the backend yet, a hard
> refresh ends the session and returns the user to `/login`. This is the §7
> contract applied literally; see §15 for the unblocking work.

---

## 6. API Layer

| Setting | Value | Reason |
|---------|-------|--------|
| `keepUnusedDataFor` | 60 s | Reasonable cache lifetime |
| `refetchOnMountOrArgChange` | 30 s | Refetch if data is 30 s stale |
| `refetchOnFocus` | false | Disabled globally — network storm risk |
| `refetchOnReconnect` | true | Good for IoT / mobile |
| `maxRetries` | 3 | Handles transient 503s / timeouts |

### Adding a New API Slice

Retries skip 4xx — `baseApi` calls `retry.fail` for any status in 400–499,
so a validation error or a 401 fails immediately instead of being re-sent
three times.

```typescript
// src/features/sensors/api/sensorApi.ts
import { apiResponseSchema, parseResponse } from '@shared/api/apiSchemas';
import { baseApi } from '@shared/api/baseApi';
import { z } from 'zod';

const readingSchema = z.object({
  id: z.string(),
  value: z.number(),
  timestamp: z.string(),
});
const readingsResponseSchema = apiResponseSchema(z.array(readingSchema));

export const sensorApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getReadings: builder.query({
      query: (deviceId: string) => `/sensors/${deviceId}/readings`,
      transformResponse: (raw: unknown) =>
        parseResponse(readingsResponseSchema, raw, 'GET /sensors/:id/readings'),
      providesTags: ['Sensor'],
    }),
  }),
});
```

Add any new tag to `tagTypes` in `shared/api/baseApi.ts` — RTK Query silently
ignores tags it does not know about.

---

## 7. Authentication & Security

### Token Storage
The JWT **never** touches localStorage. It lives in Redux memory only.
For persistent sessions across reloads, implement an HttpOnly refresh cookie:
- Server sets httpOnly cookie on login.
- `/auth/refresh` issues a new access token.
- Access token stays in memory.

Until that exists, a page reload ends the session. `AppInitializer` already
performs the boot-time `/auth/me` check, so wiring the refresh flow is a
backend change plus restoring the token before `AppInitializer` runs.

### 401 Handling
`baseApi.ts` dispatches `{ type: 'auth/logout' }` — a plain string action,
no import from `authSlice`, preventing circular dependency. `errorMiddleware`
and the sidebar's logout button use the same plain-action pattern.

### Role-Based Access
`ProtectedRoute` and `RoleGuard` are UI-only. All API endpoints must enforce
roles server-side.

The backend does not return a permission list yet, so permission-scoped routes
currently fall back to the role check alone — `route.permissions` is recorded
and logged on denial but not enforced client-side.

---

## 8. Routing & Guards

```
AppRouter                          (ErrorBoundary > Suspense > Routes)
├── PublicRoute                    → redirects to /dashboard if authenticated
│   └── AuthLayout
│       └── /login                 LoginPage
│
├── ProtectedRoute                 → redirects to /login if not authenticated
│   └── DashboardLayout            → /403 if the role check fails
│       ├── /dashboard             Dashboard
│       ├── /farms                 FarmsPage
│       ├── /farms/:farmId         FarmDetailPage
│       ├── /devices               DevicesPage
│       ├── /devices/:deviceId     DeviceDetailPage
│       ├── /settings              SettingsPage
│       ├── /master-type-constant  MasterTypeConstantPage
│       └── /users                 UsersManagementPage
│
└── PublicLayout
    ├── /404
    ├── /403
    └── /500
```

The route table lives in `shared/router/routes.ts`; `AppRouter` maps each
entry's `element` string to a lazy component and wraps it in the right guard.

All route components are **lazy loaded** via `React.lazy`, imported from their
own module rather than the feature barrel (see §1), with a single
`<Suspense fallback={<FullScreenLoading />}>` around the route tree.

Guards read auth state through `RootState`-typed selectors rather than the
auth barrel, which keeps `shared/router/` free of feature imports.

---

## 9. Forms & Validation

```typescript
// Pattern for every new form
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { mySchema, type MyFormValues } from '../schemas/my.schemas';

const form = useForm<MyFormValues>({ resolver: zodResolver(mySchema) });
```

Never use inline `register('field', { required: true })` — always delegate to Zod.

---

## 10. Error Handling Strategy

| Layer | Mechanism | Handles |
|-------|-----------|---------|
| Component | `form.formState.errors` | Field-level validation |
| Hook | `form.setError('root', …)` | Server-side form errors |
| Middleware | `errorMiddleware` | All RTK Query rejections → toast |
| Global | `ErrorBoundary` | Uncaught render errors |
| Remote | `logger.error` → Sentry stub | Production error tracking |

---

## 11. Adding a New Feature — Step-by-Step

Example: adding a **Sensors** feature.

```
1.  src/features/sensors/types/sensor.types.ts
2.  src/features/sensors/schemas/sensor.schemas.ts  (Zod)
3.  src/shared/api/baseApi.ts                       (add "Sensor" to tagTypes)
4.  src/features/sensors/api/sensorApi.ts           (injectEndpoints)
5.  src/features/sensors/store/sensorSlice.ts       (if local state needed)
6.  src/features/sensors/hooks/useSensorList.ts
7.  src/features/sensors/components/SensorsPage.tsx (view only)
8.  src/features/sensors/index.ts                   (public barrel — no route pages)
9.  src/store/rootReducer.ts                        (add reducer, import from barrel)
10. src/shared/router/routes.ts                     (add the RouteConfig entry)
11. src/shared/router/AppRouter.tsx                 (lazy import + componentMap entry)
```

Checklist before opening the PR:

- Cross-feature reads go through a barrel **or** a `RootState` selector — never
  both directions between the same pair (§1, "Breaking cycles").
- The route page is *not* exported from `index.ts`.
- Every list endpoint uses `usePaginationParams` rather than its own page state.
- Selectors returning an object or array are wrapped in `createSelector`.

---

## 12. Environment Configuration

| Variable | Required | Default (dev) | Purpose |
|----------|----------|---------------|---------|
| `VITE_API_BASE_URL` | **Yes in prod** | `https://iotapi.cultivoiot.in/cultivoiot/v1` | Backend API base |
| `VITE_SENTRY_DSN` | No | — | Error tracking DSN |
| `VITE_FF_SENSOR_ALERTS` | No | `false` | Feature flag |
| `VITE_FF_ADVANCED_REPORTS` | No | `false` | Feature flag |

Copy `.env.example` to `.env`. App throws at startup in production if `VITE_API_BASE_URL` is missing.

---

## 13. Feature Flags

```typescript
import { FEATURES } from '@config/features';

if (FEATURES.SENSOR_ALERTS) {
  return <AlertsPanel />;
}
```

Set `VITE_FF_*=true` in your deployment config to enable without a code change.

---

## 14. Performance Conventions

- Use `createSelector` for all derived values.
- Never compute objects/arrays inline in `useAppSelector`.
- `refetchOnFocus` disabled globally — enable per-query only for live data.
- Route components are lazy-loaded, so each page ships as its own chunk. Keep
  it that way: never import a route page from a barrel that the store or the
  entry chunk pulls in.
- `DataTable`: add `@tanstack/react-virtual` for datasets above
  `PAGINATION.VIRTUALISATION_THRESHOLD` (500) rows.
- ECharts is the heaviest dependency (~1.1 MB) and is reached only through
  `LineChart` on the device detail route. Keep it off shared/eager paths.

---

## 15. Known Limitations & Roadmap

| Item | Status | Notes |
|------|--------|-------|
| HttpOnly refresh token flow | **Blocking session persistence** | Requires backend `/auth/refresh` + httpOnly cookie. Until then a page refresh logs the user out (§5, §7). |
| `import/no-cycle` enforcement | Not installed | `eslint-plugin-import` + `eslint-import-resolver-typescript` not added; the no-cycle rule in §1 is convention-only. |
| Bundle analysis (`dist/stats.html`) | Not wired | Needs `rollup-plugin-visualizer` in `vite.config.ts`. |
| Permission-based route guards | Partial | `route.permissions` is declared and logged but not enforced — backend returns no permission list. |
| Farms/devices REST endpoints | Defined, not used by UI | `farmApi` / `deviceApi` exist with Zod validation, but the screens still read seed data from their slices (`*/mocks/`). Swap the slice seed for the query when the backend is ready. |
| DataTable / SidebarItem lint errors | Pre-existing | 4 `react-hooks/set-state-in-effect` + `no-unused-expressions` errors inside those two components predate this restructure and were left untouched. |
| Content Security Policy | Not configured | Add at hosting layer |
| DataTable virtualisation | Not implemented | Add `@tanstack/react-virtual` above 500 rows |
| Storybook | Not configured | Add for `shared/components/ui` |
| i18n | Not configured | Add `react-i18next` when needed |
| Optimistic updates | Not implemented | Use RTK Query `onQueryStarted` |
| Automated tests | None | No test runner configured; `npm run build` + `npm run lint` are the only gates |
| CI/CD pipeline | Not configured | GitHub Actions: lint → test → build → deploy |

