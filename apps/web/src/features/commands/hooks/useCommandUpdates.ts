import { deviceApi } from "@api/deviceApi";
import { commandApi } from "@features/commands/api/commandApi";
import {
  commandUpdated,
  isTerminalStatus,
  selectDeviceCommands,
} from "@features/commands/store/commandsSlice";
import { NON_TERMINAL_COMMAND_STATUSES } from "@cimcms/contracts";
import {
  onRealtime,
  subscribeDevice,
  useRealtimeConnection,
} from "@shared/realtime/socketClient";
import { useAppDispatch, useAppStore } from "@store/hooks";
import { useEffect } from "react";

/**
 * Keeps the commands slice in sync for one device:
 *  - `command:updated` socket events (this device) are dispatched as `commandUpdated`;
 *  - on mount, and again every time the socket (re)connects, the non-terminal
 *    commands are loaded over REST so "pending" survives a reload and a missed
 *    socket event (a command we still think is pending but the server no longer
 *    lists as non-terminal is fetched individually).
 * `deviceObjectId` is needed for the REST path (D-8).
 */
export const useCommandUpdates = (deviceId: string, deviceObjectId: string) => {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const connection = useRealtimeConnection();
  const connected = connection === "connected";

  useEffect(() => {
    const unsubscribe = subscribeDevice(deviceId);
    const off = onRealtime("command:updated", (envelope) => {
      if (envelope.deviceId !== deviceId) return;
      dispatch(commandUpdated(envelope.data));
    });
    return () => {
      off();
      unsubscribe();
    };
  }, [dispatch, deviceId]);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const seen = new Set<string>();
      for (const status of NON_TERMINAL_COMMAND_STATUSES) {
        const sub = dispatch(
          deviceApi.endpoints.getDeviceCommands.initiate(
            { id: deviceObjectId, status, limit: 100 },
            { forceRefetch: true },
          ),
        );
        try {
          const page = await sub.unwrap();
          if (cancelled) return;
          for (const command of page.data) {
            seen.add(command.commandId);
            dispatch(commandUpdated(command));
          }
        } catch {
          // Best effort: the live socket events still apply.
        } finally {
          sub.unsubscribe();
        }
      }
      // Pending locally but not listed as non-terminal any more: ask the server.
      const stale = selectDeviceCommands(store.getState(), deviceId).filter(
        (c) => !isTerminalStatus(c.status) && !seen.has(c.commandId),
      );
      for (const command of stale) {
        const sub = dispatch(
          commandApi.endpoints.getCommand.initiate(command.commandId, {
            forceRefetch: true,
          }),
        );
        try {
          const fresh = await sub.unwrap();
          if (!cancelled) dispatch(commandUpdated(fresh));
        } catch {
          // keep the pending state; a later update or reconnect resolves it
        } finally {
          sub.unsubscribe();
        }
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [dispatch, store, deviceId, deviceObjectId, connected]);
};
