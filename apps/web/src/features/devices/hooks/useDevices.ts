import {
  useGetDeviceEventsQuery,
  useGetDeviceStateQuery,
  useGetDeviceTelemetryQuery,
  useListDevicesQuery,
} from "@api/deviceApi";
import type { ReadingPoint } from "@appTypes/device.types";
import type { DeviceListItemDto, DeviceStateDto } from "@cimcms/contracts";
import { skipToken } from "@reduxjs/toolkit/query";
import { isPlannedType } from "@features/devices/utils/deviceTypeInfo";
import { useMemo } from "react";

const LIST_LIMIT = 100; // API page-size ceiling

/** All devices (with their embedded state snapshot). */
export const useDevices = () => {
  const query = useListDevicesQuery({ limit: LIST_LIMIT });
  return {
    devices: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
};

/**
 * Live state for one device: starts from the list snapshot and is replaced by the
 * REST state + `device:status` socket updates once that query has data.
 * Planned device types have no data, so no request is made.
 */
export const useLiveDeviceState = (
  device: DeviceListItemDto | undefined,
): DeviceStateDto | null => {
  const query = useGetDeviceStateQuery(
    device && !isPlannedType(device.type)
      ? { id: device.id, deviceId: device.deviceId }
      : skipToken,
  );
  return query.data ?? device?.state ?? null;
};

/** Everything the detail page needs, looked up by the physical deviceId (e.g. LED-01). */
export const useDeviceDetail = (deviceId: string | undefined) => {
  const { devices, isLoading: listLoading } = useDevices();
  const device = devices.find((d) => d.deviceId === deviceId);
  const state = useLiveDeviceState(device);
  const planned = device ? isPlannedType(device.type) : false;

  const eventsQuery = useGetDeviceEventsQuery(
    device && !planned
      ? { id: device.id, deviceId: device.deviceId, limit: 50 }
      : skipToken,
  );
  const telemetryQuery = useGetDeviceTelemetryQuery(
    device && !planned ? { id: device.id, limit: 200 } : skipToken,
  );

  // RSSI series, oldest first for the chart (API returns newest first).
  const rssiSeries = useMemo<ReadingPoint[]>(
    () =>
      (telemetryQuery.data ?? [])
        .filter((p) => p.rssiDbm !== undefined)
        .map((p) => ({ timestamp: p.ts, value: p.rssiDbm as number }))
        .reverse(),
    [telemetryQuery.data],
  );

  return {
    device,
    state,
    planned,
    isLoading: listLoading,
    notFound: !listLoading && !device,
    events: eventsQuery.data?.data ?? [],
    eventsLoading: eventsQuery.isLoading,
    rssiSeries,
  };
};
