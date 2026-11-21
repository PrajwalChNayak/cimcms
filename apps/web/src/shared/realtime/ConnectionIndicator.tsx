import {
  useRealtimeConnection,
  type ConnectionStatus,
} from "@shared/realtime/socketClient";

const LABEL: Record<ConnectionStatus, string> = {
  connected: "Live",
  connecting: "Connecting…",
  disconnected: "Offline",
};
const DOT: Record<ConnectionStatus, string> = {
  connected: "bg-emerald-500",
  connecting: "bg-amber-400 animate-pulse",
  disconnected: "bg-rose-500",
};

/** Small realtime-connection indicator for the dashboard header. */
export const ConnectionIndicator = () => {
  const status = useRealtimeConnection();
  return (
    <div
      className="hidden sm:flex items-center gap-1.5 px-2 text-xs text-text-secondary"
      role="status"
      aria-label={`Realtime connection: ${LABEL[status]}`}
      title={`Realtime connection: ${LABEL[status]}`}
      data-status={status}
    >
      <span className={`w-2 h-2 rounded-full ${DOT[status]}`} />
      {LABEL[status]}
    </div>
  );
};

export default ConnectionIndicator;
