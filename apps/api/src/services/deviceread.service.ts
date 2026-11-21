import {
  DEVICE_TYPES,
  type AuditLogDto,
  type DeviceEventDto,
  type DeviceListItemDto,
  type DeviceStateDto,
  type DeviceType,
  type Mode,
  type TelemetryPointDto,
} from "@cimcms/contracts";
import prisma from "@models/prisma.client";
import type { AuditLog, Device, Prisma, RelayStateChange } from "@prisma/client";
import TelemetryRepository from "@repositories/telemetry.repository";
import DeviceStateService from "@services/devicestate.service";
import { AppError } from "@utils/errors/custom.errors";
import PaginationUtils from "@utils/pagination.utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const KNOWN_TYPES = Object.keys(DEVICE_TYPES) as DeviceType[];

export interface PageArgs {
  page: number;
  limit: number;
}
export interface RangeArgs {
  from?: string;
  to?: string;
}

/** Row of GET /devices/:id/relay-changes. Matches `relayChangeDtoSchema` in apps/web. */
export interface RelayChangeDto {
  id: string;
  deviceId: string;
  relay: number;
  state: boolean;
  source: string;
  commandId: string | null;
  simulation: boolean;
  at: string;
}

const range = (q: RangeArgs): { gte?: Date; lte?: Date } | undefined => {
  if (!q.from && !q.to) return undefined;
  return {
    ...(q.from && { gte: new Date(q.from) }),
    ...(q.to && { lte: new Date(q.to) }),
  };
};

/** Read-only endpoints for devices, history and audit (plan T2.9). */
export default class DeviceReadService {
  private static async deviceByObjectId(id: string): Promise<Device> {
    const device = await prisma.device.findUnique({ where: { id } });
    if (!device || !(KNOWN_TYPES as string[]).includes(device.deviceType)) {
      throw new AppError("Device not found", 404, "DEVICE_NOT_FOUND");
    }
    return device;
  }

  static toDeviceDto(d: Device): Omit<DeviceListItemDto, "state"> {
    return {
      id: d.id,
      deviceId: d.deviceId,
      name: d.name ?? d.deviceId,
      type: d.deviceType as DeviceType,
      ...(d.location != null && { location: d.location }),
      ...(d.farmId != null && { farmId: d.farmId }),
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }

  static async listDevices(q: PageArgs & { type?: DeviceType }) {
    const where: Prisma.DeviceWhereInput = {
      deviceType: q.type ? q.type : { in: KNOWN_TYPES },
    };
    const { skip, take } = PaginationUtils.getSkipTake(q.page, q.limit);
    const [rows, total] = await Promise.all([
      prisma.device.findMany({ where, orderBy: { deviceId: "asc" }, skip, take }),
      prisma.device.count({ where }),
    ]);
    const states = await prisma.deviceStatus.findMany({
      where: { deviceId: { in: rows.map((r) => r.deviceId) } },
    });
    const byId = new Map(states.map((s) => [s.deviceId, DeviceStateService.toDto(s)]));
    const items: DeviceListItemDto[] = rows.map((r) => ({
      ...DeviceReadService.toDeviceDto(r),
      state: byId.get(r.deviceId) ?? null,
    }));
    return PaginationUtils.getPaginationData(items, total, q.page, q.limit);
  }

  static async state(id: string): Promise<DeviceStateDto> {
    const device = await DeviceReadService.deviceByObjectId(id);
    return DeviceStateService.snapshot(device.deviceId, device.deviceType, device.updatedAt);
  }

  /** Newest first, default window = last 24 h. */
  static async telemetry(id: string, q: RangeArgs & { limit: number }): Promise<TelemetryPointDto[]> {
    const device = await DeviceReadService.deviceByObjectId(id);
    const to = q.to ? new Date(q.to) : undefined;
    const from = q.from ? new Date(q.from) : new Date((to?.getTime() ?? Date.now()) - DAY_MS);
    const points = await TelemetryRepository.find({
      deviceId: device.deviceId,
      from,
      to,
      limit: q.limit,
      order: "desc",
    });
    return points.map((p) => ({
      ts: p.ts.toISOString(),
      mode: (p.mode ?? "MANUAL") as Mode,
      simulationMode: p.simulationMode ?? false,
      relayStates: p.relayStates ?? [],
      relayOnCount: p.relayOnCount ?? 0,
      ...(p.rssiDbm != null && { rssiDbm: p.rssiDbm }),
      wifiConnected: p.wifiConnected ?? false,
      mqttConnected: p.mqttConnected ?? false,
      ...(p.rtcValid != null && { rtcValid: p.rtcValid }),
    }));
  }

  static async events(id: string, q: PageArgs & RangeArgs & { type?: string }) {
    const device = await DeviceReadService.deviceByObjectId(id);
    const at = range(q);
    const where: Prisma.DeviceEventWhereInput = {
      deviceId: device.deviceId,
      ...(q.type && { type: q.type }),
      ...(at && { receivedAt: at }),
    };
    const { skip, take } = PaginationUtils.getSkipTake(q.page, q.limit);
    const [rows, total] = await Promise.all([
      prisma.deviceEvent.findMany({ where, orderBy: { receivedAt: "desc" }, skip, take }),
      prisma.deviceEvent.count({ where }),
    ]);
    const data: DeviceEventDto[] = rows.map(DeviceStateService.eventToDto);
    return PaginationUtils.getPaginationData(data, total, q.page, q.limit);
  }

  static relayChangeToDto(r: RelayStateChange): RelayChangeDto {
    return {
      id: r.id,
      deviceId: r.deviceId,
      relay: r.relay,
      state: r.state,
      source: r.source,
      commandId: r.commandId,
      simulation: r.simulation,
      at: r.at.toISOString(),
    };
  }

  static async relayChanges(id: string, q: PageArgs & RangeArgs & { relay?: number }) {
    const device = await DeviceReadService.deviceByObjectId(id);
    const at = range(q);
    const where: Prisma.RelayStateChangeWhereInput = {
      deviceId: device.deviceId,
      ...(q.relay !== undefined && { relay: q.relay }),
      ...(at && { at }),
    };
    const { skip, take } = PaginationUtils.getSkipTake(q.page, q.limit);
    const [rows, total] = await Promise.all([
      prisma.relayStateChange.findMany({ where, orderBy: { at: "desc" }, skip, take }),
      prisma.relayStateChange.count({ where }),
    ]);
    return PaginationUtils.getPaginationData(
      rows.map(DeviceReadService.relayChangeToDto),
      total,
      q.page,
      q.limit,
    );
  }

  static auditToDto(a: AuditLog): AuditLogDto {
    return {
      id: a.id,
      actorId: a.actorId,
      actorEmail: a.actorEmail,
      actorType: a.actorType,
      action: a.action,
      entity: a.entity,
      entityId: a.entityId,
      data: (a.data ?? {}) as Record<string, unknown>,
      ip: a.ip,
      requestId: a.requestId,
      at: a.at.toISOString(),
    };
  }

  static async audit(
    q: PageArgs & RangeArgs & { actorId?: string; action?: string; entity?: string },
  ) {
    const at = range(q);
    const where: Prisma.AuditLogWhereInput = {
      ...(q.actorId && { actorId: q.actorId }),
      ...(q.action && { action: q.action }),
      ...(q.entity && { entity: q.entity }),
      ...(at && { at }),
    };
    const { skip, take } = PaginationUtils.getSkipTake(q.page, q.limit);
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { at: "desc" }, skip, take }),
      prisma.auditLog.count({ where }),
    ]);
    return PaginationUtils.getPaginationData(
      rows.map(DeviceReadService.auditToDto),
      total,
      q.page,
      q.limit,
    );
  }
}
