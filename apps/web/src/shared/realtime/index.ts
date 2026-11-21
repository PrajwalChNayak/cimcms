export { ConnectionIndicator } from "@shared/realtime/ConnectionIndicator";
export { RealtimeBootstrap } from "@shared/realtime/RealtimeBootstrap";
export {
  connectRealtime,
  disconnectRealtime,
  onRealtime,
  subscribeDevice,
  useRealtimeConnection,
} from "@shared/realtime/socketClient";
export type {
  ConnectionStatus,
  RealtimePayload,
} from "@shared/realtime/socketClient";
