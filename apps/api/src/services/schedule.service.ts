import {
  findWindowOverlaps,
  weekMinuteLabel,
  type CreateScheduleBody,
  type DeviceConfigDto,
  type ScheduleDeviceStatusDto,
  type ScheduleDto,
  type SchedulePublishResultDto,
  type ScheduleListQuery,
  type ScheduleRuleDto,
  type ScheduleVersionDto,
  type UpdateScheduleBody,
} from "@cimcms/contracts";
import MqttClient from "@/mqtt/mqtt.client";
import prisma from "@models/prisma.client";
import { Prisma, type Schedule, type ScheduleVersion } from "@prisma/client";
import AuditService from "@services/audit.service";
import type { CommandSubject } from "@services/command.service";
import ConfigService from "@services/config.service";
import type { AuditMeta } from "@services/room.service";
import { AppError } from "@utils/errors/custom.errors";
import PaginationUtils from "@utils/pagination.utils";

const err = (status: number, code: string, message: string, details?: unknown): AppError =>
  new AppError(message, status, code, details);

const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const normaliseRules = (rules: ScheduleRuleDto[]): ScheduleRuleDto[] =>
  rules.map((r) => ({ days: [...r.days].sort((a, b) => a - b), on: r.on, off: r.off }));

/** 400 SCHEDULE_OVERLAP when two windows (the rules apply to every relay of the room) overlap. */
function assertNoOverlap(rules: ScheduleRuleDto[]): void {
  const overlaps = findWindowOverlaps(rules);
  if (overlaps.length === 0) return;
  throw err(400, "SCHEDULE_OVERLAP", "Schedule windows overlap", {
    overlaps: overlaps.map((o) => ({
      windowA: o.windowA,
      windowB: o.windowB,
      from: weekMinuteLabel(o.from),
      to: weekMinuteLabel(o.to),
    })),
  });
}

type ScheduleWithVersions = { schedule: Schedule; latest: ScheduleVersion; published: ScheduleVersion | null };

/** AUTO schedules: draft, publish, archive (plan T5.3). One active schedule per room. */
export default class ScheduleService {
  // ---------------------------------------------------------------- mapping

  static versionDto(v: ScheduleVersion): ScheduleVersionDto {
    return {
      version: v.version,
      rules: (v.rules ?? []) as ScheduleRuleDto[],
      effectiveFrom: v.effectiveFrom,
      effectiveTo: v.effectiveTo,
      createdByEmail: v.createdByEmail,
      createdAt: v.createdAt.toISOString(),
      publishedAt: v.publishedAt?.toISOString() ?? null,
    };
  }

  private static async load(id: string): Promise<ScheduleWithVersions> {
    const schedule = await prisma.schedule.findUnique({ where: { id } });
    if (!schedule) throw err(404, "SCHEDULE_NOT_FOUND", "Schedule not found");
    const versions = await prisma.scheduleVersion.findMany({
      where: {
        scheduleId: id,
        version: { in: [schedule.latestVersion, schedule.publishedVersion ?? -1] },
      },
    });
    const latest = versions.find((v) => v.version === schedule.latestVersion);
    if (!latest) throw err(500, "INTERNAL_ERROR", "Schedule version is missing");
    const published = versions.find((v) => v.version === schedule.publishedVersion) ?? null;
    return { schedule, latest, published };
  }

  private static async toDto(x: ScheduleWithVersions): Promise<ScheduleDto> {
    const room = await prisma.room.findUnique({ where: { id: x.schedule.roomId } });
    return {
      id: x.schedule.id,
      roomId: x.schedule.roomId,
      roomCode: room?.code ?? null,
      roomName: room?.name ?? null,
      name: x.schedule.name,
      status: x.schedule.status,
      latestVersion: x.schedule.latestVersion,
      publishedVersion: x.schedule.publishedVersion,
      latest: ScheduleService.versionDto(x.latest),
      published: x.published ? ScheduleService.versionDto(x.published) : null,
      createdAt: x.schedule.createdAt.toISOString(),
      updatedAt: x.schedule.updatedAt.toISOString(),
    };
  }

  private static audit(
    subject: CommandSubject,
    meta: AuditMeta,
    action: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    return AuditService.record({
      action,
      entity: "Schedule",
      entityId: id,
      actorId: subject.userId,
      actorEmail: subject.email,
      data,
      ip: meta.ip ?? null,
      requestId: meta.requestId ?? null,
    });
  }

  /** Devices that carry relays of a room, with the relay numbers. */
  static async roomDevices(roomId: string): Promise<Map<string, number[]>> {
    const rows = await prisma.roomChannelAssignment.findMany({
      where: { roomId },
      orderBy: [{ deviceId: "asc" }, { relay: "asc" }],
    });
    const out = new Map<string, number[]>();
    for (const r of rows) out.set(r.deviceId, [...(out.get(r.deviceId) ?? []), r.relay]);
    return out;
  }

  // ------------------------------------------------------------------ reads

  static async list(q: ScheduleListQuery) {
    const where: Prisma.ScheduleWhereInput = {
      ...(q.roomId && { roomId: q.roomId }),
      ...(q.status && { status: q.status }),
    };
    const { skip, take } = PaginationUtils.getSkipTake(q.page, q.limit);
    const [rows, total] = await Promise.all([
      prisma.schedule.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.schedule.count({ where }),
    ]);
    const dtos: ScheduleDto[] = [];
    for (const r of rows) dtos.push(await ScheduleService.toDto(await ScheduleService.load(r.id)));
    return PaginationUtils.getPaginationData(dtos, total, q.page, q.limit);
  }

  static async get(id: string): Promise<ScheduleDto> {
    return ScheduleService.toDto(await ScheduleService.load(id));
  }

  static async versions(id: string): Promise<ScheduleVersionDto[]> {
    await ScheduleService.load(id);
    const rows = await prisma.scheduleVersion.findMany({
      where: { scheduleId: id },
      orderBy: { version: "desc" },
    });
    return rows.map(ScheduleService.versionDto);
  }

  /** Acknowledgement status per device: the latest config sent to each device of the room. */
  static async deviceStatus(id: string): Promise<ScheduleDeviceStatusDto[]> {
    const { schedule } = await ScheduleService.load(id);
    const devices = await ScheduleService.roomDevices(schedule.roomId);
    const out: ScheduleDeviceStatusDto[] = [];
    for (const [deviceId, relays] of devices) {
      out.push({ deviceId, relays, config: await ConfigService.latestFor(deviceId) });
    }
    return out;
  }

  // ----------------------------------------------------------------- writes

  static async create(
    subject: CommandSubject,
    body: CreateScheduleBody,
    meta: AuditMeta = {},
  ): Promise<ScheduleDto> {
    const room = await prisma.room.findUnique({ where: { id: body.roomId } });
    if (!room) throw err(404, "ROOM_NOT_FOUND", "Room not found");
    const existing = await prisma.schedule.findFirst({
      where: { roomId: body.roomId, status: { not: "ARCHIVED" } },
    });
    if (existing) {
      throw err(409, "SCHEDULE_EXISTS_FOR_ROOM", `Room ${room.name} already has the schedule "${existing.name}"`, {
        scheduleId: existing.id,
      });
    }
    const rules = normaliseRules(body.rules);
    assertNoOverlap(rules);

    const schedule = await prisma.schedule.create({
      data: { roomId: body.roomId, name: body.name, status: "DRAFT", latestVersion: 1 },
    });
    await prisma.scheduleVersion.create({
      data: {
        scheduleId: schedule.id,
        version: 1,
        rules: rules as unknown as Prisma.InputJsonValue,
        effectiveFrom: body.effectiveFrom,
        effectiveTo: body.effectiveTo ?? null,
        createdById: subject.userId,
        createdByEmail: subject.email,
      },
    });
    await ScheduleService.audit(subject, meta, "SCHEDULE_CREATED", schedule.id, {
      roomId: body.roomId,
      name: body.name,
      rules,
    });
    return ScheduleService.get(schedule.id);
  }

  /**
   * Edits the latest version in place while it is a draft; a published version is immutable,
   * so editing it creates the next draft version.
   */
  static async update(
    subject: CommandSubject,
    id: string,
    body: UpdateScheduleBody,
    meta: AuditMeta = {},
  ): Promise<ScheduleDto> {
    const { schedule, latest } = await ScheduleService.load(id);
    if (schedule.status === "ARCHIVED") throw err(409, "SCHEDULE_ARCHIVED", "The schedule is archived");

    const rules = body.rules ? normaliseRules(body.rules) : ((latest.rules ?? []) as ScheduleRuleDto[]);
    const effectiveFrom = body.effectiveFrom ?? latest.effectiveFrom;
    const effectiveTo = body.effectiveTo !== undefined ? body.effectiveTo : latest.effectiveTo;
    if (effectiveTo !== null && effectiveFrom > effectiveTo) {
      throw err(400, "VALIDATION_FAILED", "effectiveTo is before effectiveFrom");
    }
    assertNoOverlap(rules);

    let version = latest.version;
    if (latest.publishedAt === null) {
      await prisma.scheduleVersion.update({
        where: { id: latest.id },
        data: {
          rules: rules as unknown as Prisma.InputJsonValue,
          effectiveFrom,
          effectiveTo,
          createdById: subject.userId,
          createdByEmail: subject.email,
        },
      });
    } else {
      version = latest.version + 1;
      try {
        await prisma.scheduleVersion.create({
          data: {
            scheduleId: id,
            version,
            rules: rules as unknown as Prisma.InputJsonValue,
            effectiveFrom,
            effectiveTo,
            createdById: subject.userId,
            createdByEmail: subject.email,
          },
        });
      } catch (e) {
        if (isUniqueViolation(e)) throw err(409, "SCHEDULE_EXISTS_FOR_ROOM", "The schedule was changed by someone else; reload it");
        throw e;
      }
    }
    await prisma.schedule.update({
      where: { id },
      data: { latestVersion: version, ...(body.name !== undefined && { name: body.name }) },
    });
    await ScheduleService.audit(subject, meta, "SCHEDULE_UPDATED", id, {
      version,
      changes: body,
    });
    return ScheduleService.get(id);
  }

  /**
   * Publishes the draft version: dry-run compile for every device of the room (size, overlap,
   * dates), then mark the version published and send the retained config to each device.
   */
  static async publish(
    subject: CommandSubject,
    id: string,
    meta: AuditMeta = {},
  ): Promise<SchedulePublishResultDto> {
    const { schedule, latest } = await ScheduleService.load(id);
    if (schedule.status === "ARCHIVED") throw err(409, "SCHEDULE_ARCHIVED", "The schedule is archived");
    if (latest.publishedAt !== null) {
      throw err(409, "SCHEDULE_NOTHING_TO_PUBLISH", "The latest version is already published; edit the schedule first");
    }
    assertNoOverlap((latest.rules ?? []) as ScheduleRuleDto[]);

    const devices = await ScheduleService.roomDevices(schedule.roomId);
    const deviceIds = [...devices.keys()];
    if (deviceIds.length > 0 && !MqttClient.isConnected()) {
      throw err(503, "MQTT_UNAVAILABLE", "Message broker is not connected");
    }
    const preview = new Map([[schedule.id, latest.version]]);
    for (const deviceId of deviceIds) await ConfigService.prepare(deviceId, { schedulePreview: preview });

    const now = new Date();
    await prisma.scheduleVersion.update({ where: { id: latest.id }, data: { publishedAt: now } });
    await prisma.schedule.update({
      where: { id },
      data: { status: "PUBLISHED", publishedVersion: latest.version },
    });

    const configs: DeviceConfigDto[] = [];
    for (const deviceId of deviceIds) {
      const res = await ConfigService.publishDevice(deviceId, {
        actor: subject,
        ip: meta.ip ?? null,
        requestId: meta.requestId ?? null,
      });
      if (res) configs.push(res.config);
    }
    await ScheduleService.audit(subject, meta, "SCHEDULE_PUBLISHED", id, {
      version: latest.version,
      devices: configs.map((c) => ({ deviceId: c.deviceId, configVersion: c.configVersion })),
    });
    const dto = await ScheduleService.get(id);
    for (const c of configs) ConfigService.emitConfig(c.deviceId, id, schedule.roomId, dto.status, c);
    return { schedule: dto, configs };
  }

  /** Archives a schedule; if devices ran it, they get a config without it. */
  static async archive(
    subject: CommandSubject,
    id: string,
    meta: AuditMeta = {},
  ): Promise<SchedulePublishResultDto> {
    const { schedule } = await ScheduleService.load(id);
    if (schedule.status === "ARCHIVED") {
      return { schedule: await ScheduleService.get(id), configs: [] };
    }
    const wasPublished = schedule.status === "PUBLISHED";
    await prisma.schedule.update({ where: { id }, data: { status: "ARCHIVED" } });
    let configs: DeviceConfigDto[] = [];
    if (wasPublished) {
      const devices = await ScheduleService.roomDevices(schedule.roomId);
      const res = await ConfigService.recompileDevices([...devices.keys()], {
        actor: subject,
        ip: meta.ip ?? null,
        requestId: meta.requestId ?? null,
      });
      configs = res.flatMap((r) => (r.config ? [r.config] : []));
    }
    await ScheduleService.audit(subject, meta, "SCHEDULE_ARCHIVED", id, { wasPublished });
    const dto = await ScheduleService.get(id);
    for (const c of configs) ConfigService.emitConfig(c.deviceId, id, schedule.roomId, dto.status, c);
    return { schedule: dto, configs };
  }
}
