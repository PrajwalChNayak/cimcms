import { refreshSession, type RefreshHost } from "@api/baseApi";
import { ENV } from "@config/env";
import {
  SERVER_EVENTS,
  SOCKET_NAMESPACE,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@cimcms/contracts";
import type { RootState } from "@store/store";
import { useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";

/**
 * Realtime client (Socket.IO, namespace /realtime).
 * No feature imports. Reads the access token from the store the same way
 * baseApi does (RootState-typed getState).
 */

export type ConnectionStatus = "connected" | "connecting" | "disconnected";
type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type ServerEvent = keyof ServerToClientEvents;
export type RealtimePayload<E extends ServerEvent> = Parameters<
  ServerToClientEvents[E]
>[0];
type Handler<E extends ServerEvent> = (payload: RealtimePayload<E>) => void;

export interface RealtimeStore extends RefreshHost {
  getState: () => RootState;
  subscribe: (listener: () => void) => () => void;
}

/** Max consecutive refresh+reconnect attempts after an auth failure (avoids a loop on a permanent 403). */
const MAX_AUTH_RETRIES = 3;
const AUTH_ERROR = /auth|token|jwt|unauthori[sz]ed|forbidden|permission|expired/i;

// ── module state ────────────────────────────────────────────────
let socket: RealtimeSocket | null = null;
let store: RealtimeStore | null = null;
let stopStoreWatch: (() => void) | null = null;
let authRetries = 0;

const subscriptions = new Map<string, number>(); // deviceId -> subscriber count
const handlers = new Map<ServerEvent, Set<(payload: never) => void>>();

let status: ConnectionStatus = "disconnected";
const statusListeners = new Set<() => void>();

const setStatus = (next: ConnectionStatus) => {
  if (status === next) return;
  status = next;
  statusListeners.forEach((l) => l());
};

const currentToken = (): string | null =>
  store?.getState().auth?.accessToken ?? null;

// ── connection ──────────────────────────────────────────────────
const emitSubscribe = (deviceId: string) => {
  if (!socket?.connected) return;
  socket.emit("subscribe:device", { deviceId }, () => {
    // Server acks { ok } and then sends the snapshot as device:status.
    // A refused subscription (unknown device) simply yields no live updates.
  });
};

const resubscribeAll = () => {
  for (const deviceId of subscriptions.keys()) emitSubscribe(deviceId);
};

/** Refresh the access token (shared with baseApi), then reconnect. */
const refreshAndReconnect = async (s: RealtimeSocket) => {
  if (!store || authRetries >= MAX_AUTH_RETRIES) {
    setStatus("disconnected");
    return;
  }
  authRetries += 1;
  setStatus("connecting");
  const ok = await refreshSession(store);
  // On failure refreshSession dispatched auth/logout; the store watcher disconnects.
  if (ok && socket === s) s.connect();
};

const createSocket = (): RealtimeSocket => {
  const s: RealtimeSocket = io(SOCKET_NAMESPACE, {
    path: ENV.SOCKET_PATH,
    auth: (cb) => cb({ token: currentToken() }),
    transports: ["websocket"],
  });

  s.on("connect", () => {
    authRetries = 0;
    setStatus("connected");
    resubscribeAll();
  });

  s.on("connect_error", (err) => {
    if (AUTH_ERROR.test(err.message)) {
      void refreshAndReconnect(s);
    } else {
      // Transport error: socket.io retries by itself.
      setStatus(s.active ? "connecting" : "disconnected");
    }
  });

  s.on("disconnect", (reason) => {
    if (reason === "io server disconnect") {
      // Server closed the socket (access token expired). The client does NOT
      // reconnect by itself after a server-initiated disconnect.
      void refreshAndReconnect(s);
    } else {
      setStatus(s.active ? "connecting" : "disconnected");
    }
  });

  for (const event of SERVER_EVENTS) {
    (s as Socket).on(event, (payload: unknown) => {
      handlers.get(event)?.forEach((h) => (h as (p: unknown) => void)(payload));
    });
  }
  return s;
};

const openSocket = () => {
  if (socket) return;
  setStatus("connecting");
  socket = createSocket();
};

const closeSocket = () => {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  authRetries = 0;
  setStatus("disconnected");
};

/**
 * Connect after login, disconnect on logout. Idempotent: calling it again with
 * the same store is a no-op. Returns a cleanup that disconnects and stops watching.
 */
export function connectRealtime(appStore: RealtimeStore): () => void {
  if (stopStoreWatch && store === appStore) return disconnectRealtime;
  disconnectRealtime();
  store = appStore;

  // React only to login/logout transitions, not to every dispatched action.
  let wasAuthed: boolean | null = null;
  const sync = () => {
    const authed = appStore.getState().auth?.isAuthenticated === true;
    if (authed === wasAuthed) return;
    wasAuthed = authed;
    if (authed) openSocket();
    else closeSocket();
  };
  stopStoreWatch = appStore.subscribe(sync);
  sync();
  return disconnectRealtime;
}

export function disconnectRealtime(): void {
  stopStoreWatch?.();
  stopStoreWatch = null;
  closeSocket();
  store = null;
}

// ── subscriptions & events ──────────────────────────────────────
/**
 * Reference-counted device subscription. `subscribe:device` is sent only for
 * the first subscriber and re-sent for all active devices on every reconnect.
 * Returns an (idempotent) unsubscribe function.
 */
export function subscribeDevice(deviceId: string): () => void {
  const count = subscriptions.get(deviceId) ?? 0;
  subscriptions.set(deviceId, count + 1);
  if (count === 0) emitSubscribe(deviceId);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (subscriptions.get(deviceId) ?? 1) - 1;
    if (left <= 0) {
      subscriptions.delete(deviceId);
      if (socket?.connected) socket.emit("unsubscribe:device", { deviceId });
    } else {
      subscriptions.set(deviceId, left);
    }
  };
}

/** Typed listener for a server event; survives reconnects. Returns the off function. */
export function onRealtime<E extends ServerEvent>(
  event: E,
  handler: Handler<E>,
): () => void {
  let set = handlers.get(event);
  if (!set) {
    set = new Set();
    handlers.set(event, set);
  }
  set.add(handler as (payload: never) => void);
  return () => {
    handlers.get(event)?.delete(handler as (payload: never) => void);
  };
}

// ── connection status ───────────────────────────────────────────
const subscribeStatus = (listener: () => void) => {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
};
const getStatus = () => status;

export const useRealtimeConnection = (): ConnectionStatus =>
  useSyncExternalStore(subscribeStatus, getStatus, getStatus);

/** Test helper: drop every subscription, handler and the socket. */
export function resetRealtimeForTests(): void {
  disconnectRealtime();
  subscriptions.clear();
  handlers.clear();
  statusListeners.clear();
  status = "disconnected";
}
