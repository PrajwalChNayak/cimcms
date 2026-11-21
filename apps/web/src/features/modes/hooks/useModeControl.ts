import { useGetDeviceEventsQuery, useGetDeviceStateQuery, type DevicePage } from "@api/deviceApi";
import { useGetDeviceReadinessQuery } from "@api/readinessApi";
import {
  DEVICE_MODES,
  type CommandDto,
  type DeviceEventDto,
  type DeviceStateDto,
  type Mode,
} from "@cimcms/contracts";
import { useSubmitCommandMutation } from "@features/commands/api/commandApi";
import { useCommandUpdates } from "@features/commands/hooks/useCommandUpdates";
import { commandSubmitted, selectDeviceCommands } from "@features/commands/store/commandsSlice";
import { OFFLINE_TEXT, STALE_TEXT } from "@features/ledControl/ledText";
import {
  MODE_NO_PERMISSION,
  MODE_SUBMIT_FAILED,
  READINESS_TEXT,
  TECHNICIAN_MODE_LIMIT,
} from "@features/modes/modeText";
import { usePermission } from "@shared/hooks/usePermission";
import { useRealtimeConnection } from "@shared/realtime/socketClient";
import { extractErrorMessage } from "@shared/utils/errorUtils";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { selectAuthRoles } from "@store/slices/authSlice";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface ModeOption {
  mode: Mode;
  current: boolean;
  /** Null when the user may request this mode now; otherwise why not. */
  blockedReason: string | null;
}

export interface ModeControl {
  state: DeviceStateDto | undefined;
  isLoading: boolean;
  mode: Mode | null | undefined;
  options: ModeOption[];
  readinessAuto: { ready: boolean; reasons: string[] } | null;
  readinessExperiment: { ready: boolean; reasons: string[] } | null;
  canSet: boolean;
  /** Latest SET_MODE command seen by this browser (any status). */
  lastCommand: CommandDto | null;
  submitError: string | null;
  setMode: (mode: Mode) => Promise<void>;
  history: DevicePage<DeviceEventDto> | undefined;
}

/** TODO(owner-decision O-4): same rule as the backend: a technician may only enter / leave MAINTENANCE. */
const technicianOnly = (roles: readonly string[] | undefined): boolean =>
  !!roles?.includes("TECHNICIAN") &&
  !roles.some((r) => r === "ADMIN" || r === "SUPER_ADMIN" || r === "OPERATOR");

export const useModeControl = (deviceObjectId: string, deviceId: string): ModeControl => {
  const dispatch = useAppDispatch();
  const stateQuery = useGetDeviceStateQuery({ id: deviceObjectId, deviceId });
  const readiness = useGetDeviceReadinessQuery(deviceObjectId);
  const history = useGetDeviceEventsQuery({
    id: deviceObjectId,
    deviceId,
    type: "MODE_CHANGED",
    limit: 20,
  });
  useCommandUpdates(deviceId, deviceObjectId);

  const hasModeSet = usePermission("DEVICE_MODE_SET");
  const hasCommand = usePermission("DEVICE_COMMAND");
  const canSet = hasModeSet && hasCommand;
  const roles = useAppSelector(selectAuthRoles);
  const connected = useRealtimeConnection() === "connected";
  const commands = useAppSelector((s) => selectDeviceCommands(s, deviceId));

  const state = stateQuery.data;
  const mode = state?.mode;

  // Readiness changes when a config is applied or the mode changes: re-read.
  const { refetch: refetchReadiness } = readiness;
  const signature = `${state?.configVersion ?? "-"}|${state?.autoReady ?? "-"}|${mode ?? "-"}`;
  const seen = useRef(signature);
  useEffect(() => {
    if (seen.current === signature) return;
    seen.current = signature;
    void refetchReadiness();
  }, [signature, refetchReadiness]);

  const options = useMemo<ModeOption[]>(() => {
    const deviceBlock = !state || state.liveness === "OFFLINE"
      ? OFFLINE_TEXT
      : state.liveness !== "ONLINE" || !mode
        ? STALE_TEXT
        : null;
    return DEVICE_MODES.map((m) => {
      let blockedReason: string | null = null;
      if (!canSet) blockedReason = MODE_NO_PERMISSION;
      else if (deviceBlock) blockedReason = deviceBlock;
      else if (m === mode) blockedReason = null;
      else if (
        technicianOnly(roles) &&
        !(m === "MAINTENANCE" || (mode === "MAINTENANCE" && m === "MANUAL"))
      ) {
        blockedReason = TECHNICIAN_MODE_LIMIT;
      } else if (m === "AUTO" && readiness.data && !readiness.data.auto.ready) {
        blockedReason = readiness.data.auto.reasons.map((r) => READINESS_TEXT[r]).join("; ");
      } else if (m === "EXPERIMENT" && readiness.data && !readiness.data.experiment.ready) {
        blockedReason = readiness.data.experiment.reasons.map((r) => READINESS_TEXT[r]).join("; ");
      } else if (!connected) {
        blockedReason = "Live connection lost — commands disabled";
      }
      return { mode: m, current: m === mode, blockedReason };
    });
  }, [state, mode, canSet, roles, readiness.data, connected]);

  const [submit] = useSubmitCommandMutation();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const setMode = useCallback(
    async (target: Mode) => {
      setSubmitError(null);
      try {
        const command = await submit({
          deviceObjectId,
          body: { action: "SET_MODE", mode: target },
        }).unwrap();
        dispatch(commandSubmitted(command));
      } catch (err) {
        setSubmitError(extractErrorMessage(err, MODE_SUBMIT_FAILED));
      }
    },
    [submit, deviceObjectId, dispatch],
  );

  return {
    state,
    isLoading: stateQuery.isLoading,
    mode,
    options,
    readinessAuto: readiness.data?.auto ?? null,
    readinessExperiment: readiness.data?.experiment ?? null,
    canSet,
    lastCommand: commands.find((c) => c.action === "SET_MODE") ?? null,
    submitError,
    setMode,
    history: history.data,
  };
};
