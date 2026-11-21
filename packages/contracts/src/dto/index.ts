import { z } from 'zod';
import {
  ACK_RESULTS,
  COMMAND_ACTIONS,
  COMMAND_SOURCES,
  COMMAND_STATUSES,
  DEVICE_EVENT_TYPES,
  BACKEND_EVENT_TYPES,
  DEVICE_MODES,
  LIVENESS,
  ON_OFF,
} from '../constants.js';
import { DEVICE_TYPES } from '../deviceTypes.js';

const iso = z.string().datetime();
const deviceTypeSchema = z.enum(Object.keys(DEVICE_TYPES) as [keyof typeof DEVICE_TYPES, ...(keyof typeof DEVICE_TYPES)[]]);
const modeSchema = z.enum(DEVICE_MODES);

export const deviceDtoSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  name: z.string(),
  type: deviceTypeSchema,
  location: z.string().optional(),
  farmId: z.string().optional(),
  createdAt: iso,
  updatedAt: iso,
});
export type DeviceDto = z.infer<typeof deviceDtoSchema>;

export const connectivityDtoSchema = z.object({
  wifiConnected: z.boolean(),
  ssid: z.string().optional(),
  ip: z.string().optional(),
  rssiDbm: z.number().optional(),
  mqttConnected: z.boolean(),
});
export type ConnectivityDto = z.infer<typeof connectivityDtoSchema>;

export const rtcDtoSchema = z.object({
  valid: z.boolean(),
  timeUtc: z.string().optional(),
  syncSource: z.string().optional(),
  lastSyncUtc: z.string().optional(),
  lastSyncResult: z.string().optional(),
  driftMs: z.number().optional(),
  lostPower: z.boolean().optional(),
});
export type RtcDto = z.infer<typeof rtcDtoSchema>;

export const deviceStateDtoSchema = z.object({
  deviceId: z.string(),
  type: deviceTypeSchema,
  liveness: z.enum(LIVENESS),
  lastSeenAt: iso.nullable(),
  firmwareVersion: z.string().nullable(),
  bootId: z.string().nullable(),
  mode: modeSchema.nullable(),
  modeStatus: z.string().nullable(),
  simulationMode: z.boolean().nullable(),
  relayStates: z.array(z.boolean()), // 16 or []
  relayOnCount: z.number().int(),
  connectivity: connectivityDtoSchema.nullable(),
  rtc: rtcDtoSchema.nullable(),
  configVersion: z.number().int().nullable(),
  autoReady: z.boolean().nullable(),
  updatedAt: iso,
});
export type DeviceStateDto = z.infer<typeof deviceStateDtoSchema>;

export const deviceListItemDtoSchema = deviceDtoSchema.extend({
  state: deviceStateDtoSchema.nullable(),
});
export type DeviceListItemDto = z.infer<typeof deviceListItemDtoSchema>;

export const commandAckDtoSchema = z.object({
  result: z.enum(ACK_RESULTS),
  reason: z.string().optional(),
  reportedState: z.enum(ON_OFF).optional(),
  receivedAt: iso,
  deviceTs: iso.optional(),
});
export type CommandAckDto = z.infer<typeof commandAckDtoSchema>;

export const commandDtoSchema = z.object({
  commandId: z.string(),
  deviceId: z.string(),
  action: z.enum(COMMAND_ACTIONS),
  params: z.record(z.string(), z.unknown()),
  source: z.enum(COMMAND_SOURCES),
  status: z.enum(COMMAND_STATUSES),
  reason: z.string().nullable(),
  lateResult: z.string().nullable(),
  issuedBy: z.object({ id: z.string(), email: z.string() }).nullable(),
  issuedAt: iso,
  expiresAt: iso,
  publishedAt: iso.nullable(),
  completedAt: iso.nullable(),
  acks: z.array(commandAckDtoSchema),
  simulation: z.boolean().nullable(),
});
export type CommandDto = z.infer<typeof commandDtoSchema>;

export const deviceEventDtoSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  type: z.enum([...DEVICE_EVENT_TYPES, ...BACKEND_EVENT_TYPES]),
  origin: z.enum(['DEVICE', 'BACKEND']),
  data: z.record(z.string(), z.unknown()),
  deviceTs: iso.nullable(),
  receivedAt: iso,
});
export type DeviceEventDto = z.infer<typeof deviceEventDtoSchema>;

export const telemetryPointDtoSchema = z.object({
  ts: iso,
  mode: modeSchema,
  simulationMode: z.boolean(),
  relayStates: z.array(z.boolean()),
  relayOnCount: z.number().int(),
  rssiDbm: z.number().optional(),
  wifiConnected: z.boolean(),
  mqttConnected: z.boolean(),
  rtcValid: z.boolean().optional(),
});
export type TelemetryPointDto = z.infer<typeof telemetryPointDtoSchema>;

export const auditLogDtoSchema = z.object({
  id: z.string(),
  actorId: z.string().nullable(),
  actorEmail: z.string().nullable(),
  actorType: z.string(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
  ip: z.string().nullable(),
  requestId: z.string().nullable(),
  at: iso,
});
export type AuditLogDto = z.infer<typeof auditLogDtoSchema>;

export const currentUserDtoSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().optional(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});
export type CurrentUserDto = z.infer<typeof currentUserDtoSchema>;
