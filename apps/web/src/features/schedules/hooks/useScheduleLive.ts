import { baseApi } from "@api/baseApi";
import { onRealtime, subscribeDevice } from "@shared/realtime/socketClient";
import { useAppDispatch } from "@store/hooks";
import { useEffect } from "react";

/**
 * Re-reads a schedule's device acknowledgement status when a device answers a config
 * (`schedule:updated` on the device rooms).
 */
export const useScheduleLive = (scheduleId: string | undefined, deviceIds: string[]): void => {
  const dispatch = useAppDispatch();
  const key = deviceIds.join(",");
  useEffect(() => {
    if (!scheduleId || key === "") return;
    const ids = key.split(",");
    const unsubscribes = ids.map((id) => subscribeDevice(id));
    const off = onRealtime("schedule:updated", (envelope) => {
      if (!ids.includes(envelope.deviceId)) return;
      dispatch(
        baseApi.util.invalidateTags([
          { type: "Schedule", id: `${scheduleId}:devices` },
          { type: "Readiness" },
        ]),
      );
    });
    return () => {
      off();
      unsubscribes.forEach((u) => u());
    };
  }, [dispatch, scheduleId, key]);
};
