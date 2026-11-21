import type http from "node:http";
import {
  deviceRoom,
  SOCKET_NAMESPACE,
  SOCKET_PATH,
  subscribeDevicePayloadSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SubscribeAck,
} from "@cimcms/contracts";
import prisma from "@models/prisma.client";
import DeviceStateService from "@services/devicestate.service";
import logger from "@utils/logger.utils";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { Server, type Socket } from "socket.io";
import { RealtimeEmitter } from "./realtime.emitter";

export interface SocketSubject {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
}

interface SocketData {
  subject: SocketSubject;
  expiryTimer?: NodeJS.Timeout;
}

type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const authError = (code: "UNAUTHENTICATED" | "FORBIDDEN"): Error =>
  Object.assign(new Error(code), { data: { errorCode: code } });

/** Verifies the handshake token. Same secret and claims as the REST auth middleware. */
function verifyHandshake(token: unknown): { subject: SocketSubject; exp?: number } {
  if (typeof token !== "string" || token === "") throw authError("UNAUTHENTICATED");
  let payload: JwtPayload;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY as string);
    if (typeof decoded === "string") throw new Error("bad payload");
    payload = decoded;
  } catch {
    throw authError("UNAUTHENTICATED");
  }
  // Tokens with a `typ` claim must be access tokens (same rule as authenticateToken).
  if (payload.typ !== undefined && payload.typ !== "access") throw authError("UNAUTHENTICATED");

  const permissions = Array.isArray(payload.permissions) ? (payload.permissions as string[]) : [];
  if (!permissions.includes("DEVICE_READ")) throw authError("FORBIDDEN");
  return {
    subject: {
      userId: String(payload.userId ?? ""),
      email: String(payload.email ?? ""),
      roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
      permissions,
    },
    ...(typeof payload.exp === "number" && { exp: payload.exp }),
  };
}

let io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData> | undefined;

async function onSubscribe(
  socket: RealtimeSocket,
  payload: unknown,
  ack: unknown,
): Promise<void> {
  const reply = (r: SubscribeAck): void => {
    if (typeof ack === "function") (ack as (r: SubscribeAck) => void)(r);
  };
  const parsed = subscribeDevicePayloadSchema.safeParse(payload);
  if (!parsed.success) return reply({ ok: false, error: "VALIDATION_FAILED" });
  const { deviceId } = parsed.data;
  try {
    const device = await prisma.device.findUnique({
      where: { deviceId },
      select: { deviceType: true, updatedAt: true },
    });
    if (!device) return reply({ ok: false, error: "DEVICE_NOT_FOUND" });
    await socket.join(deviceRoom(deviceId));
    reply({ ok: true });
    // Send the current snapshot to this socket only, so the UI never waits for the next telemetry.
    const dto = await DeviceStateService.snapshot(deviceId, device.deviceType, device.updatedAt);
    socket.emit("device:status", { v: 1, deviceId, at: new Date().toISOString(), data: dto });
  } catch (err) {
    logger.error("socket subscribe failed", { deviceId, error: String(err) });
    reply({ ok: false, error: "INTERNAL_ERROR" });
  }
}

/**
 * Attaches Socket.IO (namespace /realtime) to the HTTP server and installs it as
 * the transport behind RealtimeEmitter. Call once per server.
 */
export function attachRealtime(server: http.Server): Server {
  const origin = process.env.APP_BASE_URL;
  const server_ = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    server,
    { path: SOCKET_PATH, cors: { origin, credentials: true } },
  );
  io = server_;
  const ns = server_.of(SOCKET_NAMESPACE);

  ns.use((socket, next) => {
    try {
      const { subject, exp } = verifyHandshake(socket.handshake.auth?.token);
      socket.data.subject = subject;
      if (exp !== undefined) {
        // The client reconnects with a fresh token after the old one expires.
        const ms = Math.max(exp * 1000 - Date.now(), 0);
        socket.data.expiryTimer = setTimeout(() => socket.disconnect(true), ms);
        socket.data.expiryTimer.unref();
      }
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  ns.on("connection", (socket) => {
    socket.on("disconnect", () => {
      if (socket.data.expiryTimer) clearTimeout(socket.data.expiryTimer);
    });
    socket.on("subscribe:device", (payload, ack) => {
      void onSubscribe(socket, payload, ack);
    });
    socket.on("unsubscribe:device", (payload) => {
      const parsed = subscribeDevicePayloadSchema.safeParse(payload);
      if (parsed.success) void socket.leave(deviceRoom(parsed.data.deviceId));
    });
  });

  RealtimeEmitter.setSink({
    emit: (deviceId, event, envelope) => {
      (ns.to(deviceRoom(deviceId)) as unknown as { emit(e: string, p: unknown): void }).emit(event, envelope);
    },
  });
  return server_ as unknown as Server;
}

/** Disconnects all sockets and closes Socket.IO (also closes the HTTP server it was attached to). */
export async function closeRealtime(): Promise<void> {
  RealtimeEmitter.setSink(null);
  const current = io;
  io = undefined;
  if (current) await current.close();
}
