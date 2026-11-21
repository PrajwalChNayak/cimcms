import { z } from 'zod';
import type {
  CommandDto,
  DeviceEventDto,
  DeviceStateDto,
  TelemetryPointDto,
} from './dto/index.js';

export const SOCKET_NAMESPACE = '/realtime' as const;
export const SOCKET_PATH = '/socket.io' as const;

export const SERVER_EVENTS = [
  'device:status',
  'device:telemetry',
  'device:relay_state',
  'device:connectivity',
  'device:event',
  'command:updated',
  'schedule:updated', // Phase 5
  'experiment:updated', // Phase 5
] as const;
export const CLIENT_EVENTS = ['subscribe:device', 'unsubscribe:device'] as const;

export interface SocketEnvelope<T> {
  v: 1;
  deviceId: string;
  at: string; // ISO UTC
  data: T;
}

export interface RelayStateData {
  relayStates: boolean[];
  relayOnCount: number;
  simulationMode: boolean;
}
export interface ConnectivityData {
  liveness: DeviceStateDto['liveness'];
  lastSeenAt: string | null;
  connectivity: DeviceStateDto['connectivity'];
}

export type SubscribeAck = { ok: true } | { ok: false; error: string };

export interface ServerToClientEvents {
  'device:status': (e: SocketEnvelope<DeviceStateDto>) => void;
  'device:telemetry': (e: SocketEnvelope<TelemetryPointDto>) => void;
  'device:relay_state': (e: SocketEnvelope<RelayStateData>) => void;
  'device:connectivity': (e: SocketEnvelope<ConnectivityData>) => void;
  'device:event': (e: SocketEnvelope<DeviceEventDto>) => void;
  'command:updated': (e: SocketEnvelope<CommandDto>) => void;
  'schedule:updated': (e: SocketEnvelope<unknown>) => void;
  'experiment:updated': (e: SocketEnvelope<unknown>) => void;
}
export interface ClientToServerEvents {
  'subscribe:device': (p: { deviceId: string }, cb: (r: SubscribeAck) => void) => void;
  'unsubscribe:device': (p: { deviceId: string }) => void;
}

export const subscribeDevicePayloadSchema = z.object({
  deviceId: z.string().regex(/^[A-Za-z0-9-]{3,40}$/),
});

export function makeEnvelope<T>(deviceId: string, data: T, at: string = new Date().toISOString()): SocketEnvelope<T> {
  return { v: 1, deviceId, at, data };
}
export function deviceRoom(deviceId: string): string {
  return `device:${deviceId}`;
}
