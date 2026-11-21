import {
  getDriverChannelCount,
  type CreateRoomBody,
  type ReplaceChannelsBody,
  type RoomChannelDto,
  type RoomChannelViewDto,
  type RoomDto,
  type RoomListQuery,
  type UpdateRoomBody,
} from "@cimcms/contracts";
import prisma from "@models/prisma.client";
import { Prisma, type Room } from "@prisma/client";
import AuditService from "@services/audit.service";
import type { CommandSubject } from "@services/command.service";
import ConfigService from "@services/config.service";
import { AppError, ValidationError } from "@utils/errors/custom.errors";
import PaginationUtils from "@utils/pagination.utils";

export interface AuditMeta {
  requestId?: string | null;
  ip?: string | null;
}

const err = (status: number, code: string, message: string, details?: unknown): AppError =>
  new AppError(message, status, code, details);

const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * Rooms and the assignment of relays to rooms (plan T5.1).
 * TODO(owner-decision O-9): no rooms are seeded; rooms and their relay mapping come from the owner
 * through this API / the UI. Tests use the fixture names "Test Room A" and "Test Room B".
 */
export default class RoomService {
  static toDto(row: Room, channelCount: number): RoomDto {
    return {
      id: row.id,
      farmId: row.farmId,
      code: row.code,
      name: row.name,
      status: row.status,
      notes: row.notes,
      channelCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private static async load(id: string): Promise<Room> {
    const room = await prisma.room.findUnique({ where: { id } });
    if (!room) throw err(404, "ROOM_NOT_FOUND", "Room not found");
    return room;
  }

  private static async count(roomId: string): Promise<number> {
    return prisma.roomChannelAssignment.count({ where: { roomId } });
  }

  private static audit(
    subject: CommandSubject,
    meta: AuditMeta,
    action: string,
    roomId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    return AuditService.record({
      action,
      entity: "Room",
      entityId: roomId,
      actorId: subject.userId,
      actorEmail: subject.email,
      data,
      ip: meta.ip ?? null,
      requestId: meta.requestId ?? null,
    });
  }

  // ------------------------------------------------------------------ reads

  static async list(q: RoomListQuery) {
    const where: Prisma.RoomWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.q && {
        OR: [
          { name: { contains: q.q, mode: "insensitive" } },
          { code: { contains: q.q, mode: "insensitive" } },
        ],
      }),
    };
    const { skip, take } = PaginationUtils.getSkipTake(q.page, q.limit);
    const [rows, total] = await Promise.all([
      prisma.room.findMany({ where, orderBy: { code: "asc" }, skip, take }),
      prisma.room.count({ where }),
    ]);
    const assignments = await prisma.roomChannelAssignment.findMany({
      where: { roomId: { in: rows.map((r) => r.id) } },
      select: { roomId: true },
    });
    const counts = new Map<string, number>();
    for (const a of assignments) counts.set(a.roomId, (counts.get(a.roomId) ?? 0) + 1);
    return PaginationUtils.getPaginationData(
      rows.map((r) => RoomService.toDto(r, counts.get(r.id) ?? 0)),
      total,
      q.page,
      q.limit,
    );
  }

  static async get(id: string): Promise<RoomDto> {
    const room = await RoomService.load(id);
    return RoomService.toDto(room, await RoomService.count(id));
  }

  static async getChannels(id: string): Promise<RoomChannelDto[]> {
    await RoomService.load(id);
    const rows = await prisma.roomChannelAssignment.findMany({
      where: { roomId: id },
      orderBy: [{ deviceId: "asc" }, { relay: "asc" }],
    });
    return rows.map((r) => ({ deviceId: r.deviceId, relay: r.relay, label: r.label }));
  }

  /** All assignments (optionally of one device) with their room: channel picker and relay labels. */
  static async channelView(deviceId?: string): Promise<RoomChannelViewDto[]> {
    const rows = await prisma.roomChannelAssignment.findMany({
      where: deviceId ? { deviceId } : {},
      orderBy: [{ deviceId: "asc" }, { relay: "asc" }],
    });
    const rooms = await prisma.room.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.roomId))] } },
    });
    const byId = new Map(rooms.map((r) => [r.id, r]));
    return rows.flatMap((r) => {
      const room = byId.get(r.roomId);
      if (!room) return [];
      return [
        {
          deviceId: r.deviceId,
          relay: r.relay,
          label: r.label,
          roomId: room.id,
          roomCode: room.code,
          roomName: room.name,
        },
      ];
    });
  }

  // ----------------------------------------------------------------- writes

  static async create(
    subject: CommandSubject,
    body: CreateRoomBody,
    meta: AuditMeta = {},
  ): Promise<RoomDto> {
    const exists = await prisma.room.findUnique({ where: { code: body.code } });
    if (exists) throw err(409, "ROOM_CODE_TAKEN", `Room code ${body.code} is already in use`);
    let row: Room;
    try {
      row = await prisma.room.create({
        data: {
          code: body.code,
          name: body.name,
          ...(body.farmId && { farmId: body.farmId }),
          ...(body.notes !== undefined && { notes: body.notes }),
          ...(body.status && { status: body.status }),
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw err(409, "ROOM_CODE_TAKEN", `Room code ${body.code} is already in use`);
      throw e;
    }
    await RoomService.audit(subject, meta, "ROOM_CREATED", row.id, {
      code: row.code,
      name: row.name,
      status: row.status,
    });
    return RoomService.toDto(row, 0);
  }

  static async update(
    subject: CommandSubject,
    id: string,
    body: UpdateRoomBody,
    meta: AuditMeta = {},
  ): Promise<RoomDto> {
    const before = await RoomService.load(id);
    const row = await prisma.room.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.farmId !== undefined && { farmId: body.farmId }),
      },
    });
    await RoomService.audit(subject, meta, "ROOM_UPDATED", id, {
      code: row.code,
      changes: body,
      previous: { name: before.name, status: before.status, notes: before.notes, farmId: before.farmId },
    });
    return RoomService.toDto(row, await RoomService.count(id));
  }

  /**
   * Replaces the full set of channels of a room. Validates relay ranges against the
   * driver `channelCount`; a relay owned by another room gives 409 RELAY_ALREADY_ASSIGNED.
   * Returns the devices whose assignment changed (for config recompile hooks).
   */
  static async replaceChannels(
    subject: CommandSubject,
    id: string,
    body: ReplaceChannelsBody,
    meta: AuditMeta = {},
  ): Promise<{ channels: RoomChannelDto[]; affectedDeviceIds: string[] }> {
    const room = await RoomService.load(id);
    const wanted = body.channels;

    const seen = new Set<string>();
    const dupes: { deviceId: string; relay: number }[] = [];
    for (const c of wanted) {
      const k = `${c.deviceId}#${c.relay}`;
      if (seen.has(k)) dupes.push({ deviceId: c.deviceId, relay: c.relay });
      seen.add(k);
    }
    if (dupes.length > 0) {
      throw new ValidationError("A relay is listed more than once", "VALIDATION_FAILED", dupes);
    }

    const deviceIds = [...new Set(wanted.map((c) => c.deviceId))];
    const devices = await prisma.device.findMany({ where: { deviceId: { in: deviceIds } } });
    const byDevice = new Map(devices.map((d) => [d.deviceId, d]));
    for (const deviceId of deviceIds) {
      const device = byDevice.get(deviceId);
      if (!device) throw err(404, "DEVICE_NOT_FOUND", `Device ${deviceId} not found`);
      const channelCount = getDriverChannelCount(device.deviceType);
      if (channelCount === null) {
        throw new ValidationError(`Device ${deviceId} has no relay channels`, "VALIDATION_FAILED", [
          { deviceId },
        ]);
      }
      const bad = wanted.filter((c) => c.deviceId === deviceId && c.relay > channelCount);
      if (bad.length > 0) {
        throw new ValidationError(
          `Relay out of range for ${deviceId} (1..${channelCount})`,
          "VALIDATION_FAILED",
          bad.map((b) => ({ deviceId, relay: b.relay })),
        );
      }
    }

    const conflict = async (): Promise<void> => {
      if (wanted.length === 0) return;
      const others = await prisma.roomChannelAssignment.findMany({
        where: {
          roomId: { not: id },
          OR: wanted.map((c) => ({ deviceId: c.deviceId, relay: c.relay })),
        },
      });
      const first = others[0];
      if (!first) return;
      const rooms = await prisma.room.findMany({ where: { id: { in: others.map((o) => o.roomId) } } });
      const byId = new Map(rooms.map((r) => [r.id, r]));
      const other = byId.get(first.roomId);
      throw err(
        409,
        "RELAY_ALREADY_ASSIGNED",
        `Relay ${first.relay} of ${first.deviceId} is already assigned to room ${other?.name ?? "?"} (${other?.code ?? "?"})`,
        others.map((o) => ({
          deviceId: o.deviceId,
          relay: o.relay,
          roomId: o.roomId,
          roomCode: byId.get(o.roomId)?.code ?? null,
          roomName: byId.get(o.roomId)?.name ?? null,
        })),
      );
    };
    await conflict();

    const previous = await prisma.roomChannelAssignment.findMany({ where: { roomId: id } });
    try {
      await prisma.$transaction([
        prisma.roomChannelAssignment.deleteMany({ where: { roomId: id } }),
        prisma.roomChannelAssignment.createMany({
          data: wanted.map((c) => ({
            roomId: id,
            deviceId: c.deviceId,
            relay: c.relay,
            label: c.label ?? null,
          })),
        }),
      ]);
    } catch (e) {
      if (isUniqueViolation(e)) {
        await conflict(); // someone else took a relay between check and write
        throw err(409, "RELAY_ALREADY_ASSIGNED", "A relay is already assigned to another room");
      }
      throw e;
    }

    const channels = await RoomService.getChannels(id);
    const affected = new Set<string>([...previous.map((p) => p.deviceId), ...deviceIds]);
    await RoomService.audit(subject, meta, "ROOM_CHANNELS_REPLACED", id, {
      code: room.code,
      before: previous.map((p) => ({ deviceId: p.deviceId, relay: p.relay })),
      after: channels,
    });
    // A device whose relays moved between rooms may now run a different schedule: re-send its config.
    await ConfigService.recompileDevices([...affected], {
      actor: subject,
      ip: meta.ip ?? null,
      requestId: meta.requestId ?? null,
    });
    return { channels, affectedDeviceIds: [...affected] };
  }
}
