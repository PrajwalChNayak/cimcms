import {
  useGetDeviceStateQuery,
  useGetRelayChangesQuery,
} from "@api/deviceApi";
import type { CommandDto, DeviceStateDto } from "@cimcms/contracts";
import { LED_CHANNEL_COUNT } from "@cimcms/contracts";
import { useSubmitCommandMutation } from "@features/commands/api/commandApi";
import { useCommandUpdates } from "@features/commands/hooks/useCommandUpdates";
import {
  commandSubmitted,
  selectDeviceCommands,
  selectPendingAll,
  selectPendingRelays,
  type PendingInfo,
} from "@features/commands/store/commandsSlice";
import {
  OFFLINE_TEXT,
  REALTIME_DOWN_TEXT,
  STALE_TEXT,
  SUBMIT_FAILED_TEXT,
  modeBlockedText,
} from "@features/ledControl/ledText";
import { usePermission } from "@shared/hooks/usePermission";
import { useRealtimeConnection } from "@shared/realtime/socketClient";
import { extractErrorMessage } from "@shared/utils/errorUtils";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface RelayView {
  relay: number; // 1..16
  /** State reported by the device (telemetry); null when unknown. Never taken from a command. */
  reportedOn: boolean | null;
  pending: PendingInfo | null;
  /** Latest SET_RELAY command for this relay (any status). */
  lastCommand: CommandDto | null;
  /** Time of the last reported change of this relay (ISO UTC), if known. */
  lastChangeAt: string | null;
}

export interface LedController {
  state: DeviceStateDto | undefined;
  isLoading: boolean;
  liveness: DeviceStateDto["liveness"] | undefined;
  simulationMode: boolean;
  mode: DeviceStateDto["mode"] | undefined;
  /** User holds DEVICE_COMMAND (controls are shown at all). */
  hasCommandPermission: boolean;
  /** User holds DEVICE_COMMAND_BULK. */
  hasBulkPermission: boolean;
  canCommand: boolean;
  /** Exact section 9 text explaining why commands are disabled, or null. */
  blockReason: string | null;
  relays: RelayView[];
  bulkPending: PendingInfo | null;
  /** Latest SET_ALL_RELAYS command (any status). */
  lastBulk: CommandDto | null;
  /** Message of the last refused submit (e.g. HTTP 409), cleared on the next click. */
  submitError: string | null;
  setRelay: (relay: number, on: boolean) => Promise<void>;
  setAll: (on: boolean) => Promise<void>;
}

/** Same rules as the backend (plan D-11). */
const modeAllows = (
  mode: DeviceStateDto["mode"] | null | undefined,
  hasDiagnostics: boolean,
): boolean => mode === "MANUAL" || (mode === "MAINTENANCE" && hasDiagnostics);

export const useLedController = (
  deviceObjectId: string,
  deviceId: string,
): LedController => {
  const dispatch = useAppDispatch();
  const stateQuery = useGetDeviceStateQuery({ id: deviceObjectId, deviceId });
  useCommandUpdates(deviceId, deviceObjectId);

  const hasCommandPermission = usePermission("DEVICE_COMMAND");
  const hasBulkPermission = usePermission("DEVICE_COMMAND_BULK");
  const hasDiagnostics = usePermission("DEVICE_DIAGNOSTICS");
  const connected = useRealtimeConnection() === "connected";

  const state = stateQuery.data;
  const liveness = state?.liveness;
  const mode = state?.mode;

  const pendingRelays = useAppSelector((s) => selectPendingRelays(s, deviceId));
  const bulkPending = useAppSelector((s) => selectPendingAll(s, deviceId));
  const commands = useAppSelector((s) => selectDeviceCommands(s, deviceId));

  // Last change time per relay (REST), refreshed when the reported states change.
  const changes = useGetRelayChangesQuery({ id: deviceObjectId, limit: 100 });
  const stateSignature = state?.relayStates.map((b) => (b ? 1 : 0)).join("");
  const seenSignature = useRef(stateSignature);
  const { refetch: refetchChanges } = changes;
  useEffect(() => {
    if (seenSignature.current === stateSignature) return;
    seenSignature.current = stateSignature;
    void refetchChanges();
  }, [stateSignature, refetchChanges]);

  const blockReason = useMemo<string | null>(() => {
    if (!state || liveness === "OFFLINE") return OFFLINE_TEXT;
    if (liveness !== "ONLINE" || !mode) return STALE_TEXT;
    if (!modeAllows(mode, hasDiagnostics)) return modeBlockedText(mode);
    if (!connected) return REALTIME_DOWN_TEXT;
    return null;
  }, [state, liveness, mode, hasDiagnostics, connected]);

  const canCommand = hasCommandPermission && blockReason === null;

  const relays = useMemo<RelayView[]>(() => {
    const lastChange = new Map<number, string>();
    for (const c of changes.data?.data ?? []) {
      const prev = lastChange.get(c.relay);
      if (!prev || Date.parse(c.at) > Date.parse(prev)) lastChange.set(c.relay, c.at);
    }
    const lastCommand = new Map<number, CommandDto>();
    for (const c of commands) {
      // `commands` is newest first: keep the first SET_RELAY seen per relay.
      if (c.action !== "SET_RELAY") continue;
      const r = c.params["relay"];
      if (typeof r === "number" && !lastCommand.has(r)) lastCommand.set(r, c);
    }
    const reported = state?.relayStates ?? [];
    return Array.from({ length: LED_CHANNEL_COUNT }, (_, i) => {
      const relay = i + 1;
      return {
        relay,
        reportedOn: reported.length === LED_CHANNEL_COUNT ? reported[i] : null,
        pending: pendingRelays[relay] ?? null,
        lastCommand: lastCommand.get(relay) ?? null,
        lastChangeAt: lastChange.get(relay) ?? null,
      };
    });
  }, [state?.relayStates, pendingRelays, commands, changes.data]);

  const lastBulk = useMemo(
    () => commands.find((c) => c.action === "SET_ALL_RELAYS") ?? null,
    [commands],
  );

  const [submit] = useSubmitCommandMutation();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const send = useCallback(
    async (body: Parameters<typeof submit>[0]["body"]) => {
      setSubmitError(null);
      try {
        const command = await submit({ deviceObjectId, body }).unwrap();
        dispatch(commandSubmitted(command));
      } catch (err) {
        setSubmitError(extractErrorMessage(err, SUBMIT_FAILED_TEXT));
      }
    },
    [submit, deviceObjectId, dispatch],
  );

  const setRelay = useCallback(
    async (relay: number, on: boolean) => {
      if (!canCommand || pendingRelays[relay] || bulkPending) return;
      await send({ action: "SET_RELAY", relay, state: on ? "ON" : "OFF" });
    },
    [canCommand, pendingRelays, bulkPending, send],
  );

  const setAll = useCallback(
    async (on: boolean) => {
      if (!canCommand || !hasBulkPermission || bulkPending) return;
      await send({ action: "SET_ALL_RELAYS", state: on ? "ON" : "OFF" });
    },
    [canCommand, hasBulkPermission, bulkPending, send],
  );

  return {
    state,
    isLoading: stateQuery.isLoading,
    liveness,
    simulationMode: state?.simulationMode === true,
    mode,
    hasCommandPermission,
    hasBulkPermission,
    canCommand,
    blockReason,
    relays,
    bulkPending,
    lastBulk,
    submitError,
    setRelay,
    setAll,
  };
};
