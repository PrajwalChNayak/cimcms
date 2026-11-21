import type {
  ConnectivityDto,
  DeviceEventDto,
  DeviceStateDto,
  DeviceType,
  Liveness,
  Mode,
  RtcDto,
} from "@cimcms/contracts";
import prisma from "@models/prisma.client";
import { Prisma, type DeviceEvent, type DeviceStatus } from "@prisma/client";
import { RealtimeEmitter } from "@/realtime/realtime.emitter";
import logger from "@utils/logger.utils";

export type DeviceStatusPatch = Omit<
  Prisma.DeviceStatusUncheckedUpdateInput,
  "id" | "deviceId" | "type" | "liveness" | "createdAt" | "updatedAt"
>;

export interface ApplyResult {
  before: DeviceStatus | null;
  after: DeviceStatus;
  livenessChanged: boolean;
}

const LIVENESS_EVENT: Partial<Record<Liveness, "ONLINE" | "OFFLINE" | "STALE">> = {
  ONLINE: "ONLINE",
  OFFLINE: "OFFLINE",
  STALE: "STALE",
};

const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/** Reads, writes and maps the per-device state snapshot (`DeviceStatus`). */
export default class DeviceStateService {
  static async get(deviceId: string): Promise<DeviceStatus | null> {
    return prisma.deviceStatus.findUnique({ where: { deviceId } });
  }

  static toDto(row: DeviceStatus): DeviceStateDto {
    return {
      deviceId: row.deviceId,
      type: row.type as DeviceType,
      liveness: row.liveness,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      firmwareVersion: row.firmwareVersion,
      bootId: row.bootId,
      mode: (row.mode as Mode | null) ?? null,
      modeStatus: row.modeStatus,
      simulationMode: row.simulationMode,
      relayStates: row.relayStates,
      relayOnCount: row.relayOnCount,
      connectivity: (row.connectivity as ConnectivityDto | null) ?? null,
      rtc: (row.rtc as RtcDto | null) ?? null,
      configVersion: row.configVersion,
      autoReady: row.autoReady,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Snapshot for a registered device that has not reported anything yet. */
  static emptyDto(deviceId: string, type: string, updatedAt: Date): DeviceStateDto {
    return {
      deviceId,
      type: type as DeviceType,
      liveness: "UNKNOWN",
      lastSeenAt: null,
      firmwareVersion: null,
      bootId: null,
      mode: null,
      modeStatus: null,
      simulationMode: null,
      relayStates: [],
      relayOnCount: 0,
      connectivity: null,
      rtc: null,
      configVersion: null,
      autoReady: null,
      updatedAt: updatedAt.toISOString(),
    };
  }

  /** Current snapshot as a DTO (empty snapshot when the device never reported). */
  static async snapshot(deviceId: string, type: string, deviceUpdatedAt: Date): Promise<DeviceStateDto> {
    const row = await DeviceStateService.get(deviceId);
    return row
      ? DeviceStateService.toDto(row)
      : DeviceStateService.emptyDto(deviceId, type, deviceUpdatedAt);
  }

  static eventToDto(row: DeviceEvent): DeviceEventDto {
    return {
      id: row.id,
      deviceId: row.deviceId,
      type: row.type as DeviceEventDto["type"],
      origin: row.origin as DeviceEventDto["origin"],
      data: (row.data ?? {}) as Record<string, unknown>,
      deviceTs: row.deviceTs?.toISOString() ?? null,
      receivedAt: row.receivedAt.toISOString(),
    };
  }

  static emitStatus(row: DeviceStatus): void {
    RealtimeEmitter.deviceStatus(row.deviceId, DeviceStateService.toDto(row));
  }

  /** Stores a backend-origin event (ONLINE, OFFLINE, STALE, SCHEMA_REJECTED, UNKNOWN_ACK). */
  static async recordBackendEvent(
    deviceId: string,
    type: string,
    data: Record<string, unknown>,
  ): Promise<DeviceEvent> {
    return prisma.deviceEvent.create({
      data: { deviceId, type, origin: "BACKEND", data: data as Prisma.InputJsonValue },
    });
  }

  /**
   * Upserts the snapshot. When `liveness` differs from the stored value, writes
   * one backend event (ONLINE/OFFLINE/STALE) and emits `device:connectivity`.
   * Callers emit `device:status` themselves (once per message).
   */
  static async apply(
    deviceId: string,
    type: string,
    patch: DeviceStatusPatch,
    liveness?: Liveness,
  ): Promise<ApplyResult> {
    const before = await DeviceStateService.get(deviceId);
    const previous: Liveness = before?.liveness ?? "UNKNOWN";
    const next: Liveness = liveness ?? previous;
    const update = { ...patch, liveness: next } as Prisma.DeviceStatusUncheckedUpdateInput;
    const create = { ...patch, deviceId, type, liveness: next } as Prisma.DeviceStatusUncheckedCreateInput;

    const run = (): Promise<DeviceStatus> =>
      prisma.deviceStatus.upsert({ where: { deviceId }, create, update });
    let after: DeviceStatus;
    try {
      after = await run();
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      after = await run(); // lost an insert race: the row exists now, so this is an update
    }

    const livenessChanged = next !== previous;
    if (livenessChanged) {
      const eventType = LIVENESS_EVENT[next];
      if (eventType) {
        try {
          await DeviceStateService.recordBackendEvent(deviceId, eventType, { previous });
        } catch (err) {
          logger.error("liveness event write failed", { deviceId, error: String(err) });
        }
      }
      RealtimeEmitter.connectivity(deviceId, {
        liveness: next,
        lastSeenAt: after.lastSeenAt?.toISOString() ?? null,
        connectivity: (after.connectivity as ConnectivityDto | null) ?? null,
      });
    }
    return { before, after, livenessChanged };
  }

  /** Sets liveness only (used by the liveness sweeper), emitting connectivity + status on change. */
  static async setLiveness(deviceId: string, type: string, liveness: Liveness): Promise<boolean> {
    const { after, livenessChanged } = await DeviceStateService.apply(deviceId, type, {}, liveness);
    if (livenessChanged) DeviceStateService.emitStatus(after);
    return livenessChanged;
  }
}
