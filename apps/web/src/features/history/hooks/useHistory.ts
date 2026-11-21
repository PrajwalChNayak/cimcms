import { baseApi } from "@api/baseApi";
import { useListAuditQuery } from "@api/auditApi";
import {
  useGetDeviceCommandsQuery,
  useGetDeviceEventsQuery,
} from "@api/deviceApi";
import {
  BACKEND_EVENT_TYPES,
  COMMAND_STATUSES,
  DEVICE_EVENT_TYPES,
  type CommandDto,
} from "@cimcms/contracts";
import { useDevices } from "@features/devices/hooks/useDevices";
import { usePaginationParams } from "@shared/hooks/usePaginationParams";
import { onRealtime, subscribeDevice } from "@shared/realtime/socketClient";
import {
  formatDuration,
  istDateEndToUtcIso,
  istDateStartToUtcIso,
} from "@shared/utils/time";
import { useAppDispatch } from "@store/hooks";
import { skipToken } from "@reduxjs/toolkit/query";
import { useEffect, useMemo } from "react";

export const COMMAND_STATUS_OPTIONS = COMMAND_STATUSES;
export const EVENT_TYPE_OPTIONS = [
  ...DEVICE_EVENT_TYPES,
  ...BACKEND_EVENT_TYPES,
] as const;

const asStatus = (v: string): CommandDto["status"] | undefined =>
  (COMMAND_STATUSES as readonly string[]).includes(v)
    ? (v as CommandDto["status"])
    : undefined;
const asEventType = (v: string) =>
  (EVENT_TYPE_OPTIONS as readonly string[]).includes(v)
    ? (v as (typeof EVENT_TYPE_OPTIONS)[number])
    : undefined;

/** Look a device up by its physical id (the URL param, e.g. LED-01). */
const useDeviceRef = (deviceId: string | undefined) => {
  const { devices, isLoading } = useDevices();
  const device = devices.find((d) => d.deviceId === deviceId);
  return { device, isLoading, notFound: !isLoading && !device };
};

// ── commands ────────────────────────────────────────────────────
export interface CommandRow {
  commandId: string;
  time: string; // issuedAt ISO UTC (formatted by the view)
  user: string;
  action: string;
  relay: string;
  requested: string;
  command: CommandDto; // for the status pill
  reason: string;
  latency: string;
}

const relayText = (c: CommandDto): string =>
  c.action === "SET_ALL_RELAYS"
    ? "All"
    : typeof c.params["relay"] === "number"
      ? String(c.params["relay"])
      : "—";

export const toCommandRow = (c: CommandDto): CommandRow => ({
  commandId: c.commandId,
  time: c.issuedAt,
  user: c.issuedBy?.email ?? (c.source === "web" ? "—" : c.source),
  action: c.action,
  relay: relayText(c),
  requested:
    typeof c.params["state"] === "string" ? (c.params["state"] as string) : "—",
  command: c,
  reason: c.reason ?? "",
  latency: formatDuration(c.issuedAt, c.completedAt),
});

const COMMAND_FILTERS = ["status"] as const;

export const useCommandHistory = (deviceId: string | undefined) => {
  const dispatch = useAppDispatch();
  const { device, isLoading: deviceLoading, notFound } = useDeviceRef(deviceId);
  const p = usePaginationParams(COMMAND_FILTERS);

  const query = useGetDeviceCommandsQuery(
    device
      ? {
          id: device.id,
          page: p.page,
          limit: p.pageSize,
          status: asStatus(p.filters.status),
        }
      : skipToken,
  );

  // New command results arrive over the socket: refetch the list instead of patching pages.
  const objectId = device?.id;
  useEffect(() => {
    if (!device) return;
    const unsubscribe = subscribeDevice(device.deviceId);
    const off = onRealtime("command:updated", (e) => {
      if (e.deviceId !== device.deviceId) return;
      dispatch(
        baseApi.util.invalidateTags([{ type: "DeviceCommands", id: objectId }]),
      );
    });
    return () => {
      off();
      unsubscribe();
    };
  }, [device, objectId, dispatch]);

  const rows = useMemo(
    () => (query.data?.data ?? []).map(toCommandRow),
    [query.data],
  );
  return {
    device,
    notFound,
    rows,
    total: query.data?.total ?? 0,
    loading: deviceLoading || query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    ...p,
  };
};

// ── events ──────────────────────────────────────────────────────
const EVENT_FILTERS = ["type", "from", "to"] as const;

export const useEventHistory = (deviceId: string | undefined) => {
  const { device, isLoading: deviceLoading, notFound } = useDeviceRef(deviceId);
  const p = usePaginationParams(EVENT_FILTERS);

  const query = useGetDeviceEventsQuery(
    device
      ? {
          id: device.id,
          deviceId: device.deviceId,
          page: p.page,
          limit: p.pageSize,
          type: asEventType(p.filters.type),
          from: istDateStartToUtcIso(p.filters.from),
          to: istDateEndToUtcIso(p.filters.to),
        }
      : skipToken,
  );
  return {
    device,
    notFound,
    rows: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    loading: deviceLoading || query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    ...p,
  };
};

// ── audit ───────────────────────────────────────────────────────
const AUDIT_FILTERS = ["action", "entity", "from", "to"] as const;

export const useAuditHistory = () => {
  const p = usePaginationParams(AUDIT_FILTERS);
  const query = useListAuditQuery({
    page: p.page,
    limit: p.pageSize,
    action: p.filters.action.trim() || undefined,
    entity: p.filters.entity.trim() || undefined,
    from: istDateStartToUtcIso(p.filters.from),
    to: istDateEndToUtcIso(p.filters.to),
  });
  return {
    rows: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    loading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    ...p,
  };
};
