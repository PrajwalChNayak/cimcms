import {
  commandDtoSchema,
  COMMAND_STATUSES,
  deviceEventDtoSchema,
  deviceListItemDtoSchema,
  deviceStateDtoSchema,
  telemetryPointDtoSchema,
  type CommandDto,
  type DeviceEventDto,
  type DeviceListItemDto,
  type DeviceStateDto,
  type DeviceType,
  type TelemetryPointDto,
} from "@cimcms/contracts";
import { baseApi } from "@api/baseApi";
import type { PaginatedResponse } from "@appTypes/api.types";
import { onRealtime, subscribeDevice } from "@shared/realtime/socketClient";
import {
  apiResponseSchema,
  paginatedSchema,
  parseResponse,
} from "@shared/utils/apiSchemas";
import { z } from "zod";

/** Max live device events kept in the events cache (plan T3.3). */
export const MAX_CACHED_EVENTS = 200;

// ── Response schemas ──────────────────────────────────────────
// Not in contracts: row of GET /devices/:id/relay-changes (RelayStateChange model).
export const relayChangeDtoSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  relay: z.number().int(),
  state: z.boolean(),
  source: z.string(),
  commandId: z.string().nullable(),
  simulation: z.boolean(),
  at: z.string(),
});
export type RelayChangeDto = z.infer<typeof relayChangeDtoSchema>;

const listSchema = apiResponseSchema(paginatedSchema(deviceListItemDtoSchema));
const stateSchema = apiResponseSchema(deviceStateDtoSchema);
const telemetrySchema = apiResponseSchema(z.array(telemetryPointDtoSchema));
const eventsSchema = apiResponseSchema(paginatedSchema(deviceEventDtoSchema));
const commandsSchema = apiResponseSchema(paginatedSchema(commandDtoSchema));
const relayChangesSchema = apiResponseSchema(paginatedSchema(relayChangeDtoSchema));

// ── Args ──────────────────────────────────────────────────────
interface PageArgs {
  page?: number;
  limit?: number;
}
interface RangeArgs {
  /** ISO UTC */
  from?: string;
  to?: string;
}
/** `id` = MongoDB ObjectId (REST path, D-8); `deviceId` = physical id (sockets, e.g. LED-01). */
export interface DeviceRef {
  id: string;
  deviceId: string;
}

export type ListDevicesArgs = PageArgs & { type?: DeviceType };
export type DeviceEventsArgs = DeviceRef &
  PageArgs &
  RangeArgs & { type?: DeviceEventDto["type"] };
export type DeviceTelemetryArgs = { id: string; limit?: number } & RangeArgs;
export type DeviceCommandsArgs = { id: string } & PageArgs & {
    status?: (typeof COMMAND_STATUSES)[number];
  };
export type RelayChangesArgs = { id: string; relay?: number } & PageArgs &
  RangeArgs;

export type DevicePage<T> = PaginatedResponse<T>;

const isNewer = (candidateIso: string, currentIso: string) =>
  Date.parse(candidateIso) >= Date.parse(currentIso);

export const deviceApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listDevices: builder.query<DevicePage<DeviceListItemDto>, ListDevicesArgs | void>({
      query: (params) => ({ url: "/devices", params: params ?? undefined }),
      transformResponse: (raw: unknown) =>
        parseResponse(listSchema, raw, "GET /devices").result,
      providesTags: [{ type: "Device", id: "LIST" }],
    }),

    /**
     * Snapshot + live updates: while the cache entry lives we are subscribed to the
     * device room and apply `device:status` snapshots that are not older than the cache.
     */
    getDeviceState: builder.query<DeviceStateDto, DeviceRef>({
      query: ({ id }) => `/devices/${id}/state`,
      transformResponse: (raw: unknown) =>
        parseResponse(stateSchema, raw, "GET /devices/:id/state").result,
      providesTags: (_r, _e, { id }) => [{ type: "DeviceState", id }],
      async onCacheEntryAdded(
        { deviceId },
        { cacheDataLoaded, cacheEntryRemoved, updateCachedData },
      ) {
        try {
          await cacheDataLoaded;
        } catch {
          return; // request failed: nothing to keep live
        }
        const unsubscribe = subscribeDevice(deviceId);
        const off = onRealtime("device:status", (envelope) => {
          if (envelope.deviceId !== deviceId) return;
          const incoming = envelope.data;
          updateCachedData((current) =>
            isNewer(incoming.updatedAt, current.updatedAt) ? incoming : current,
          );
        });
        await cacheEntryRemoved;
        off();
        unsubscribe();
      },
    }),

    getDeviceTelemetry: builder.query<TelemetryPointDto[], DeviceTelemetryArgs>({
      query: ({ id, ...params }) => ({
        url: `/devices/${id}/telemetry`,
        params,
      }),
      transformResponse: (raw: unknown) =>
        parseResponse(telemetrySchema, raw, "GET /devices/:id/telemetry").result,
      providesTags: (_r, _e, { id }) => [{ type: "DeviceTelemetry", id }],
    }),

    getDeviceEvents: builder.query<DevicePage<DeviceEventDto>, DeviceEventsArgs>({
      // `deviceId` is only for the live subscription; the path uses the ObjectId.
      query: ({ id, deviceId: _deviceId, ...params }) => ({
        url: `/devices/${id}/events`,
        params,
      }),
      transformResponse: (raw: unknown) =>
        parseResponse(eventsSchema, raw, "GET /devices/:id/events").result,
      providesTags: (_r, _e, { id }) => [{ type: "DeviceEvents", id }],
      async onCacheEntryAdded(
        { deviceId, type, page, from, to },
        { cacheDataLoaded, cacheEntryRemoved, updateCachedData },
      ) {
        try {
          await cacheDataLoaded;
        } catch {
          return;
        }
        const unsubscribe = subscribeDevice(deviceId);
        const off = onRealtime("device:event", (envelope) => {
          const event = envelope.data;
          if (envelope.deviceId !== deviceId) return;
          // Live items only belong on the first page, and must match a type filter.
          if ((page ?? 1) !== 1) return;
          if (from || to) return; // a date range is a fixed window: no live items
          if (type && event.type !== type) return;
          updateCachedData((current) => {
            if (current.data.some((e) => e.id === event.id)) return current;
            return {
              ...current,
              total: current.total + 1,
              data: [event, ...current.data].slice(0, MAX_CACHED_EVENTS),
            };
          });
        });
        await cacheEntryRemoved;
        off();
        unsubscribe();
      },
    }),

    getDeviceCommands: builder.query<DevicePage<CommandDto>, DeviceCommandsArgs>({
      query: ({ id, ...params }) => ({
        url: `/devices/${id}/commands`,
        params,
      }),
      transformResponse: (raw: unknown) =>
        parseResponse(commandsSchema, raw, "GET /devices/:id/commands").result,
      providesTags: (_r, _e, { id }) => [{ type: "DeviceCommands", id }],
    }),

    getRelayChanges: builder.query<DevicePage<RelayChangeDto>, RelayChangesArgs>({
      query: ({ id, ...params }) => ({
        url: `/devices/${id}/relay-changes`,
        params,
      }),
      transformResponse: (raw: unknown) =>
        parseResponse(relayChangesSchema, raw, "GET /devices/:id/relay-changes")
          .result,
      providesTags: (_r, _e, { id }) => [{ type: "RelayChanges", id }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListDevicesQuery,
  useGetDeviceStateQuery,
  useGetDeviceTelemetryQuery,
  useGetDeviceEventsQuery,
  useGetDeviceCommandsQuery,
  useGetRelayChangesQuery,
} = deviceApi;
