import type { CommandDto } from "@cimcms/contracts";
import { createSlice, createSelector, type PayloadAction } from "@reduxjs/toolkit";
import { logout } from "@store/slices/authSlice";

/**
 * Commands seen by this browser session (submitted here or pushed by
 * `command:updated`). Relay state is NEVER derived from here (plan section 8
 * rule 3): this only drives the pending / last-result UI.
 */
export type PendingKey = "ALL" | string; // "ALL" or the relay number as a string

interface CommandsState {
  byId: Record<string, CommandDto>;
  /** deviceId (physical) -> key -> commandId of the non-terminal command */
  pendingKey: Record<string, Record<PendingKey, string>>;
}

const initialState: CommandsState = { byId: {}, pendingKey: {} };

const NON_TERMINAL = ["PENDING", "PUBLISHED", "ACCEPTED"] as const;
export const isTerminalStatus = (status: CommandDto["status"]): boolean =>
  !(NON_TERMINAL as readonly string[]).includes(status);

const rank = (status: CommandDto["status"]): number => {
  const i = (NON_TERMINAL as readonly string[]).indexOf(status);
  return i === -1 ? NON_TERMINAL.length : i;
};

/** Pending key a command occupies, or null (REQUEST_STATUS etc. do not block relays). */
export const pendingKeyOf = (
  command: Pick<CommandDto, "action" | "params">,
): PendingKey | null => {
  if (command.action === "SET_ALL_RELAYS") return "ALL";
  if (command.action === "SET_RELAY") {
    const relay = command.params["relay"];
    return typeof relay === "number" ? String(relay) : null;
  }
  return null;
};

/**
 * Updates can arrive out of order (the REST answer after the socket push, or
 * PUBLISHED after EXECUTED). Never go back in the lifecycle; the first terminal
 * status wins (a late ack only changes `lateResult` / `acks` of a TIMEOUT).
 */
const accept = (old: CommandDto | undefined, next: CommandDto): boolean => {
  if (!old) return true;
  const a = rank(old.status);
  const b = rank(next.status);
  if (b > a) return true;
  if (b < a) return false;
  return isTerminalStatus(next.status)
    ? next.status === old.status
    : true;
};

const commandsSlice = createSlice({
  name: "commands",
  initialState,
  reducers: {
    commandSubmitted: (state, action: PayloadAction<CommandDto>) => {
      applyCommand(state, action.payload);
    },
    commandUpdated: (state, action: PayloadAction<CommandDto>) => {
      applyCommand(state, action.payload);
    },
    /** Test / logout helper. */
    commandsCleared: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(logout, () => initialState);
  },
});

function applyCommand(state: CommandsState, command: CommandDto) {
  if (!accept(state.byId[command.commandId], command)) return;
  state.byId[command.commandId] = command;

  const key = pendingKeyOf(command);
  if (key === null) return;
  const forDevice = (state.pendingKey[command.deviceId] ??= {});
  if (isTerminalStatus(command.status)) {
    if (forDevice[key] === command.commandId) delete forDevice[key];
  } else {
    forDevice[key] = command.commandId;
  }
}

export const { commandSubmitted, commandUpdated, commandsCleared } =
  commandsSlice.actions;
export default commandsSlice.reducer;

// ── selectors ───────────────────────────────────────────────────
type S = { commands: CommandsState };
const EMPTY_KEYS: Record<PendingKey, string> = {};

const selectById = (state: S) => state.commands.byId;
const selectDeviceArg = (_state: S, deviceId: string) => deviceId;

export const selectPendingKeys = (
  state: S,
  deviceId: string,
): Record<PendingKey, string> =>
  state.commands.pendingKey[deviceId] ?? EMPTY_KEYS;

/** All known commands of one device, newest first. */
export const selectDeviceCommands = createSelector(
  [selectById, selectDeviceArg],
  (byId, deviceId) =>
    Object.values(byId)
      .filter((c) => c.deviceId === deviceId)
      .sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt)),
);

export interface PendingInfo {
  commandId: string;
  requestedOn: boolean | null;
}

const requestedOn = (c: CommandDto | undefined): boolean | null =>
  c ? (c.params["state"] === "ON" ? true : c.params["state"] === "OFF" ? false : null) : null;

/** Pending SET_RELAY commands of one device, by relay number. */
export const selectPendingRelays = createSelector(
  [selectById, selectPendingKeys],
  (byId, keys) => {
    const out: Record<number, PendingInfo> = {};
    for (const [key, commandId] of Object.entries(keys)) {
      if (key === "ALL") continue;
      out[Number(key)] = { commandId, requestedOn: requestedOn(byId[commandId]) };
    }
    return out;
  },
);

/** Pending SET_ALL_RELAYS command of one device, if any. */
export const selectPendingAll = createSelector(
  [selectById, selectPendingKeys],
  (byId, keys): PendingInfo | null => {
    const commandId = keys["ALL"];
    return commandId
      ? { commandId, requestedOn: requestedOn(byId[commandId]) }
      : null;
  },
);
