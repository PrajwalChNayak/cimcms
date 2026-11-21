import { connectRealtime, type RealtimeStore } from "@shared/realtime/socketClient";
import { useEffect } from "react";
import { useStore } from "react-redux";

/** Mount once under the Provider: connects the socket after login, disconnects on logout. */
export const RealtimeBootstrap = () => {
  const store = useStore();
  useEffect(
    () => connectRealtime(store as unknown as RealtimeStore),
    [store],
  );
  return null;
};

export default RealtimeBootstrap;
