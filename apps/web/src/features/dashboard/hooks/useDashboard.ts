import { deviceApi } from "@api/deviceApi";
import type {
  CommandDto,
  DeviceEventDto,
  DeviceListItemDto,
  DeviceStateDto,
} from "@cimcms/contracts";
import { commandUpdated } from "@features/commands/store/commandsSlice";
import { useDevices } from "@features/devices/hooks/useDevices";
import { isPlannedType } from "@features/devices/utils/deviceTypeInfo";
import { onRealtime } from "@shared/realtime/socketClient";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { useEffect, useMemo } from "react";
import { shallowEqual } from "react-redux";

/** Command results that need attention (plan T3.5: failed / timed out / rejected). */
const PROBLEM_STATUSES: ReadonlyArray<CommandDto["status"]> = [
  "FAILED",
  "PUBLISH_FAILED",
  "TIMEOUT",
  "REJECTED",
];
export const MAX_PROBLEM_COMMANDS = 5;
export const MAX_RECENT_EVENTS = 10;

export type AlertKind = "OFFLINE" | "STALE" | "RTC_INVALID" | "COMMAND";
export interface DashboardAlert {
  id: string;
  kind: AlertKind;
  deviceId: string;
  /** ISO UTC when known */
  at: string | null;
  command?: CommandDto;
}

export interface DashboardDevice {
  device: DeviceListItemDto;
  planned: boolean;
  state: DeviceStateDto | null;
}

const byTimeDesc = <T,>(get: (x: T) => string) => (a: T, b: T) =>
  Date.parse(get(b)) - Date.parse(get(a));

/**
 * Everything the CIMCMS dashboard shows. Each listed device is kept live: the
 * state query subscribes to its socket room, the events query prepends live
 * `device:event` items and every `command:updated` is stored for the alerts.
 */
export const useDashboard = () => {
  const dispatch = useAppDispatch();
  const { devices, isLoading, isError, refetch } = useDevices();
  const active = useMemo(
    () => devices.filter((d) => !isPlannedType(d.type)),
    [devices],
  );
  const activeKey = active.map((d) => `${d.id}:${d.deviceId}`).join(",");

  useEffect(() => {
    const subs = active.flatMap((d) => [
      dispatch(
        deviceApi.endpoints.getDeviceState.initiate({
          id: d.id,
          deviceId: d.deviceId,
        }),
      ),
      dispatch(
        deviceApi.endpoints.getDeviceCommands.initiate({ id: d.id, limit: 50 }),
      ),
      dispatch(
        deviceApi.endpoints.getDeviceEvents.initiate({
          id: d.id,
          deviceId: d.deviceId,
          limit: MAX_RECENT_EVENTS,
        }),
      ),
    ]);
    return () => subs.forEach((s) => s.unsubscribe());
    // `active` is derived from `activeKey`; depending on the key avoids resubscribing on every list refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, activeKey]);

  // Live command results (the device rooms are joined by the state queries above).
  useEffect(
    () =>
      onRealtime("command:updated", (envelope) => {
        dispatch(commandUpdated(envelope.data));
      }),
    [dispatch],
  );

  const states = useAppSelector(
    (s) =>
      active.map(
        (d) =>
          deviceApi.endpoints.getDeviceState.select({
            id: d.id,
            deviceId: d.deviceId,
          })(s).data,
      ),
    shallowEqual,
  );
  const commandPages = useAppSelector(
    (s) =>
      active.map(
        (d) =>
          deviceApi.endpoints.getDeviceCommands.select({ id: d.id, limit: 50 })(s)
            .data,
      ),
    shallowEqual,
  );
  const eventPages = useAppSelector(
    (s) =>
      active.map(
        (d) =>
          deviceApi.endpoints.getDeviceEvents.select({
            id: d.id,
            deviceId: d.deviceId,
            limit: MAX_RECENT_EVENTS,
          })(s).data,
      ),
    shallowEqual,
  );
  const liveCommands = useAppSelector((s) => s.commands.byId);

  const cards = useMemo<DashboardDevice[]>(() => {
    const liveState = new Map<string, DeviceStateDto>();
    active.forEach((d, i) => {
      const fresh = states[i];
      if (fresh) liveState.set(d.id, fresh);
    });
    return devices.map((device) => ({
      device,
      planned: isPlannedType(device.type),
      state: liveState.get(device.id) ?? device.state,
    }));
  }, [devices, active, states]);

  const alerts = useMemo<DashboardAlert[]>(() => {
    const out: DashboardAlert[] = [];
    for (const { device, planned, state } of cards) {
      if (planned || !state) continue;
      if (state.liveness === "OFFLINE" || state.liveness === "STALE") {
        out.push({
          id: `${device.deviceId}-${state.liveness}`,
          kind: state.liveness,
          deviceId: device.deviceId,
          at: state.lastSeenAt,
        });
      }
      if (state.rtc && !state.rtc.valid) {
        out.push({
          id: `${device.deviceId}-RTC`,
          kind: "RTC_INVALID",
          deviceId: device.deviceId,
          at: state.updatedAt,
        });
      }
    }
    // Last failed / timed-out / rejected commands: REST pages merged with live updates.
    const merged = new Map<string, CommandDto>();
    for (const page of commandPages) {
      for (const c of page?.data ?? []) merged.set(c.commandId, c);
    }
    for (const c of Object.values(liveCommands)) merged.set(c.commandId, c);
    [...merged.values()]
      .filter((c) => PROBLEM_STATUSES.includes(c.status))
      .sort(byTimeDesc((c) => c.issuedAt))
      .slice(0, MAX_PROBLEM_COMMANDS)
      .forEach((command) =>
        out.push({
          id: `cmd-${command.commandId}`,
          kind: "COMMAND",
          deviceId: command.deviceId,
          at: command.completedAt ?? command.issuedAt,
          command,
        }),
      );
    return out;
  }, [cards, commandPages, liveCommands]);

  const recentEvents = useMemo<DeviceEventDto[]>(
    () =>
      eventPages
        .flatMap((p) => p?.data ?? [])
        .sort(byTimeDesc((e) => e.receivedAt))
        .slice(0, MAX_RECENT_EVENTS),
    [eventPages],
  );

  return { cards, alerts, recentEvents, isLoading, isError, refetch };
};
