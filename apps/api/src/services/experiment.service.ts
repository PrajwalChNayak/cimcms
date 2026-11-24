import {
  findWindowOverlaps,
  getDriverChannelCount,
  weekMinuteLabel,
  type CreateExperimentBody,
  type DeviceConfigDto,
  type ExperimentActionResultDto,
  type ExperimentAssignmentDto,
  type ExperimentDeviceStatusDto,
  type ExperimentDto,
  type ExperimentListQuery,
  type ExperimentLogEntryDto,
  type ExperimentStatus,
  type ExperimentWarningDto,
  type Mode,
  type ScheduleRuleDto,
  type UpdateExperimentBody,
} from "@cimcms/contracts";
import MqttClient from "@/mqtt/mqtt.client";
import { RealtimeEmitter } from "@/realtime/realtime.emitter";
import prisma from "@models/prisma.client";
import { Prisma, type Experiment, type ExperimentAssignment } from "@prisma/client";
import AuditService from "@services/audit.service";
import CommandService, { type CommandSubject } from "@services/command.service";
import ConfigService from "@services/config.service";
import DeviceStateService from "@services/devicestate.service";
import ReadinessService from "@services/readiness.service";
import type { AuditMeta } from "@services/room.service";
import { AppError } from "@utils/errors/custom.errors";
import logger from "@utils/logger.utils";
import PaginationUtils from "@utils/pagination.utils";

const err = (status: number, code: string, message: string, details?: unknown): AppError =>
  new AppError(message, status, code, details);

const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Statuses in which the experiment block is part of a device config. */
const ACTIVE: readonly ExperimentStatus[] = ["READY", "RUNNING", "PAUSED"];
/** The reconcile sweep leaves a device alone this long after its last SET_MODE command. */
const RECONCILE_QUIET_MS = 30_000;

const normalise = (rules: ScheduleRuleDto[]): ScheduleRuleDto[] =>
  rules.map((r) => ({ days: [...r.days].sort((a, b) => a - b), on: r.on, off: r.off }));

/**
 * Experiments (plan T5.4). Lifecycle: DRAFT -> READY (config with the experiment block sent
 * to the devices) -> RUNNING (SET_MODE EXPERIMENT) <-> PAUSED -> STOPPED | COMPLETED.
 *
 * TODO(owner-decision O-15): pause = SET_MODE MAINTENANCE and resume = SET_MODE EXPERIMENT;
 * relays that are not part of the experiment are OFF while EXPERIMENT runs (device side);
 * stop / completion return the devices to MANUAL. All of this is a default until the owner answers.
 */
export default class ExperimentService {
  // ---------------------------------------------------------------- mapping

  private static toDto(exp: Experiment, assignments: ExperimentAssignment[]): ExperimentDto {
    return {
      id: exp.id,
      code: exp.code,
      title: exp.title,
      description: exp.description,
      status: exp.status,
      startsAt: exp.startsAt.toISOString(),
      endsAt: exp.endsAt.toISOString(),
      createdByEmail: exp.createdByEmail,
      assignments: assignments
        .sort((a, b) => a.groupLabel.localeCompare(b.groupLabel) || a.deviceId.localeCompare(b.deviceId) || a.relay - b.relay)
        .map(
          (a): ExperimentAssignmentDto => ({
            groupLabel: a.groupLabel,
            deviceId: a.deviceId,
            relay: a.relay,
            windows: (a.windows ?? []) as ScheduleRuleDto[],
          }),
        ),
      createdAt: exp.createdAt.toISOString(),
      updatedAt: exp.updatedAt.toISOString(),
    };
  }

  private static async load(id: string): Promise<{ exp: Experiment; assignments: ExperimentAssignment[] }> {
    const exp = await prisma.experiment.findUnique({ where: { id } });
    if (!exp) throw err(404, "EXPERIMENT_NOT_FOUND", "Experiment not found");
    const assignments = await prisma.experimentAssignment.findMany({ where: { experimentId: id } });
    return { exp, assignments };
  }

  private static async dto(id: string): Promise<ExperimentDto> {
    const { exp, assignments } = await ExperimentService.load(id);
    return ExperimentService.toDto(exp, assignments);
  }

  private static deviceIds(assignments: { deviceId: string }[]): string[] {
    return [...new Set(assignments.map((a) => a.deviceId))].sort();
  }

  private static audit(
    subject: CommandSubject,
    meta: AuditMeta,
    action: string,
    exp: Pick<Experiment, "id" | "code">,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    return AuditService.record({
      action,
      entity: "Experiment",
      entityId: exp.id,
      actorId: subject.userId,
      actorEmail: subject.email,
      data: { code: exp.code, ...data },
      ip: meta.ip ?? null,
      requestId: meta.requestId ?? null,
    });
  }

  private static emit(exp: Pick<Experiment, "id" | "code">, status: ExperimentStatus, devices: string[]): void {
    for (const deviceId of devices) {
      RealtimeEmitter.experimentUpdated(deviceId, { experimentId: exp.id, code: exp.code, status });
    }
  }

  /** Atomic state change; 409 when somebody else already moved the experiment. */
  private static async transition(
    id: string,
    from: readonly ExperimentStatus[],
    to: ExperimentStatus,
  ): Promise<void> {
    const { count } = await prisma.experiment.updateMany({
      where: { id, status: { in: [...from] } },
      data: { status: to },
    });
    if (count === 0) {
      const now = await prisma.experiment.findUnique({ where: { id }, select: { status: true } });
      if (!now) throw err(404, "EXPERIMENT_NOT_FOUND", "Experiment not found");
      throw err(409, "EXPERIMENT_INVALID_STATE", `The experiment is ${now.status}; this needs ${from.join(" or ")}`, {
        status: now.status,
        allowed: from,
      });
    }
  }

  // ------------------------------------------------------------ validation

  private static async validateAssignments(
    assignments: CreateExperimentBody["assignments"],
  ): Promise<void> {
    const seen = new Set<string>();
    for (const [i, a] of assignments.entries()) {
      const key = `${a.deviceId}#${a.relay}`;
      if (seen.has(key)) {
        throw err(400, "VALIDATION_FAILED", `Relay ${a.relay} of ${a.deviceId} is listed twice`, [
          { index: i, deviceId: a.deviceId, relay: a.relay },
        ]);
      }
      seen.add(key);
      const overlaps = findWindowOverlaps(a.windows);
      if (overlaps.length > 0) {
        throw err(400, "SCHEDULE_OVERLAP", `Windows overlap on relay ${a.relay} of ${a.deviceId}`, {
          scope: "EXPERIMENT",
          index: i,
          deviceId: a.deviceId,
          relay: a.relay,
          overlaps: overlaps.map((o) => ({
            windowA: o.windowA,
            windowB: o.windowB,
            from: weekMinuteLabel(o.from),
            to: weekMinuteLabel(o.to),
          })),
        });
      }
    }
    const ids = [...new Set(assignments.map((a) => a.deviceId))];
    const devices = await prisma.device.findMany({ where: { deviceId: { in: ids } } });
    const byId = new Map(devices.map((d) => [d.deviceId, d]));
    for (const deviceId of ids) {
      const device = byId.get(deviceId);
      if (!device) throw err(404, "DEVICE_NOT_FOUND", `Device ${deviceId} not found`);
      const count = getDriverChannelCount(device.deviceType);
      if (count === null) throw err(400, "VALIDATION_FAILED", `Device ${deviceId} has no relay channels`);
      const bad = assignments.find((a) => a.deviceId === deviceId && a.relay > count);
      if (bad) throw err(400, "VALIDATION_FAILED", `Relay ${bad.relay} is out of range for ${deviceId} (1..${count})`);
    }
  }

  // ------------------------------------------------------------------ reads

  static async list(q: ExperimentListQuery) {
    const where: Prisma.ExperimentWhereInput = { ...(q.status && { status: q.status }) };
    const { skip, take } = PaginationUtils.getSkipTake(q.page, q.limit);
    const [rows, total] = await Promise.all([
      prisma.experiment.findMany({ where, orderBy: { startsAt: "desc" }, skip, take }),
      prisma.experiment.count({ where }),
    ]);
    const all = await prisma.experimentAssignment.findMany({
      where: { experimentId: { in: rows.map((r) => r.id) } },
    });
    const dtos = rows.map((r) =>
      ExperimentService.toDto(r, all.filter((a) => a.experimentId === r.id)),
    );
    return PaginationUtils.getPaginationData(dtos, total, q.page, q.limit);
  }

  static get(id: string): Promise<ExperimentDto> {
    return ExperimentService.dto(id);
  }

  /** Readiness of each device of the experiment: live state and the latest config. */
  static async deviceStatus(id: string): Promise<ExperimentDeviceStatusDto[]> {
    const { assignments } = await ExperimentService.load(id);
    const out: ExperimentDeviceStatusDto[] = [];
    for (const deviceId of ExperimentService.deviceIds(assignments)) {
      const [state, latest] = await Promise.all([
        DeviceStateService.get(deviceId),
        prisma.deviceConfig.findFirst({ where: { deviceId }, orderBy: { configVersion: "desc" } }),
      ]);
      const payload = (latest?.payload ?? {}) as { experiment?: { experiment_id?: string } | null };
      out.push({
        deviceId,
        relays: assignments.filter((a) => a.deviceId === deviceId).map((a) => a.relay).sort((a, b) => a - b),
        liveness: state?.liveness ?? "UNKNOWN",
        mode: state?.mode ?? null,
        config: latest ? ConfigService.toDto(latest) : null,
        carriesExperiment: payload.experiment?.experiment_id === id,
      });
    }
    return out;
  }

  /** Event log: audit entries of the experiment plus the mode and config events of its devices. */
  static async log(id: string): Promise<ExperimentLogEntryDto[]> {
    const { exp, assignments } = await ExperimentService.load(id);
    const [audits, events] = await Promise.all([
      prisma.auditLog.findMany({
        where: { entity: "Experiment", entityId: id },
        orderBy: { at: "desc" },
        take: 100,
      }),
      prisma.deviceEvent.findMany({
        where: {
          deviceId: { in: ExperimentService.deviceIds(assignments) },
          type: { in: ["MODE_CHANGED", "CONFIG_APPLIED"] },
          receivedAt: { gte: exp.createdAt },
        },
        orderBy: { receivedAt: "desc" },
        take: 100,
      }),
    ]);
    const rows: ExperimentLogEntryDto[] = [
      ...audits.map((a) => ({
        at: a.at.toISOString(),
        source: "AUDIT" as const,
        type: a.action,
        deviceId: null,
        actorEmail: a.actorEmail,
        data: (a.data ?? {}) as Record<string, unknown>,
      })),
      ...events.map((e) => ({
        at: e.receivedAt.toISOString(),
        source: "DEVICE" as const,
        type: e.type,
        deviceId: e.deviceId,
        actorEmail: null,
        data: (e.data ?? {}) as Record<string, unknown>,
      })),
    ];
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
  }

  // ----------------------------------------------------------------- writes

  static async create(
    subject: CommandSubject,
    body: CreateExperimentBody,
    meta: AuditMeta = {},
  ): Promise<ExperimentDto> {
    if (await prisma.experiment.findUnique({ where: { code: body.code } })) {
      throw err(409, "EXPERIMENT_CODE_TAKEN", `Experiment code ${body.code} is already in use`);
    }
    if (Date.parse(body.endsAt) <= Date.now()) {
      throw err(400, "VALIDATION_FAILED", "The experiment must end in the future");
    }
    await ExperimentService.validateAssignments(body.assignments);

    let exp: Experiment;
    try {
      exp = await prisma.experiment.create({
        data: {
          code: body.code,
          title: body.title,
          ...(body.description !== undefined && { description: body.description }),
          status: "DRAFT",
          startsAt: new Date(body.startsAt),
          endsAt: new Date(body.endsAt),
          createdById: subject.userId,
          createdByEmail: subject.email,
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw err(409, "EXPERIMENT_CODE_TAKEN", `Experiment code ${body.code} is already in use`);
      throw e;
    }
    await prisma.experimentAssignment.createMany({
      data: body.assignments.map((a) => ({
        experimentId: exp.id,
        groupLabel: a.groupLabel,
        deviceId: a.deviceId,
        relay: a.relay,
        windows: normalise(a.windows) as unknown as Prisma.InputJsonValue,
      })),
    });
    await ExperimentService.audit(subject, meta, "EXPERIMENT_CREATED", exp, {
      title: exp.title,
      assignments: body.assignments.length,
    });
    return ExperimentService.dto(exp.id);
  }

  static async update(
    subject: CommandSubject,
    id: string,
    body: UpdateExperimentBody,
    meta: AuditMeta = {},
  ): Promise<ExperimentDto> {
    const { exp } = await ExperimentService.load(id);
    if (exp.status !== "DRAFT") {
      throw err(409, "EXPERIMENT_INVALID_STATE", `Only a DRAFT experiment can be edited (it is ${exp.status})`, {
        status: exp.status,
      });
    }
    const startsAt = body.startsAt ? new Date(body.startsAt) : exp.startsAt;
    const endsAt = body.endsAt ? new Date(body.endsAt) : exp.endsAt;
    if (endsAt.getTime() <= startsAt.getTime()) throw err(400, "VALIDATION_FAILED", "endsAt must be after startsAt");
    if (endsAt.getTime() <= Date.now()) throw err(400, "VALIDATION_FAILED", "The experiment must end in the future");
    if (body.assignments) await ExperimentService.validateAssignments(body.assignments);

    await prisma.experiment.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        startsAt,
        endsAt,
      },
    });
    if (body.assignments) {
      await prisma.$transaction([
        prisma.experimentAssignment.deleteMany({ where: { experimentId: id } }),
        prisma.experimentAssignment.createMany({
          data: body.assignments.map((a) => ({
            experimentId: id,
            groupLabel: a.groupLabel,
            deviceId: a.deviceId,
            relay: a.relay,
            windows: normalise(a.windows) as unknown as Prisma.InputJsonValue,
          })),
        }),
      ]);
    }
    await ExperimentService.audit(subject, meta, "EXPERIMENT_UPDATED", exp, { changes: Object.keys(body) });
    return ExperimentService.dto(id);
  }

  // ------------------------------------------------------------- lifecycle

  /**
   * DRAFT -> READY: dry-run compile of every device (size, overlap, conflicts), then send the
   * retained config with the experiment block. The devices confirm it with CONFIG_APPLIED.
   */
  static async markReady(
    subject: CommandSubject,
    id: string,
    meta: AuditMeta = {},
  ): Promise<ExperimentActionResultDto> {
    const { exp, assignments } = await ExperimentService.load(id);
    if (exp.status !== "DRAFT") {
      throw err(409, "EXPERIMENT_INVALID_STATE", `Only a DRAFT experiment can be made ready (it is ${exp.status})`, {
        status: exp.status,
      });
    }
    if (exp.endsAt.getTime() <= Date.now()) throw err(400, "VALIDATION_FAILED", "The experiment period has already ended");
    const devices = ExperimentService.deviceIds(assignments);
    if (devices.length === 0) throw err(400, "VALIDATION_FAILED", "The experiment has no relays");

    // One active experiment per device: checked first (clear error), and again under a
    // per-device lock in the same transaction as DRAFT -> READY, so two experiments cannot
    // both claim a device.
    await ExperimentService.assertNoConflict(prisma, id, devices);
    if (!MqttClient.isConnected()) throw err(503, "MQTT_UNAVAILABLE", "Message broker is not connected");
    for (const deviceId of devices) await ConfigService.prepare(deviceId, { experimentPreview: id });

    await prisma.$transaction(async (tx) => {
      for (const deviceId of [...devices].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"experiment:" + deviceId}))`;
      }
      await ExperimentService.assertNoConflict(tx, id, devices);
      const { count } = await tx.experiment.updateMany({ where: { id, status: "DRAFT" }, data: { status: "READY" } });
      if (count === 0) {
        throw err(409, "EXPERIMENT_INVALID_STATE", "The experiment is no longer a DRAFT", { allowed: ["DRAFT"] });
      }
    });
    const configs = await ExperimentService.sendConfigs(subject, devices, meta);
    await ExperimentService.audit(subject, meta, "EXPERIMENT_READY", exp, { devices });
    ExperimentService.emit(exp, "READY", devices);
    return { experiment: await ExperimentService.dto(id), configs, commandIds: [], warnings: [] };
  }

  /** READY -> DRAFT (to edit it again); the devices get a config without the experiment. */
  static async revertToDraft(
    subject: CommandSubject,
    id: string,
    meta: AuditMeta = {},
  ): Promise<ExperimentActionResultDto> {
    const { exp, assignments } = await ExperimentService.load(id);
    await ExperimentService.transition(id, ["READY"], "DRAFT");
    const devices = ExperimentService.deviceIds(assignments);
    const warnings: ExperimentWarningDto[] = [];
    const configs = await ExperimentService.sendConfigs(subject, devices, meta, warnings);
    await ExperimentService.audit(subject, meta, "EXPERIMENT_REVERTED", exp, { devices });
    ExperimentService.emit(exp, "DRAFT", devices);
    return { experiment: await ExperimentService.dto(id), configs, commandIds: [], warnings };
  }

  /** Re-sends the config of a READY / RUNNING / PAUSED experiment (e.g. a device rejected it). */
  static async resend(
    subject: CommandSubject,
    id: string,
    meta: AuditMeta = {},
  ): Promise<ExperimentActionResultDto> {
    const { exp, assignments } = await ExperimentService.load(id);
    if (!ACTIVE.includes(exp.status)) {
      throw err(409, "EXPERIMENT_INVALID_STATE", `The experiment is ${exp.status}`, { status: exp.status });
    }
    const warnings: ExperimentWarningDto[] = [];
    const configs = await ExperimentService.sendConfigs(
      subject,
      ExperimentService.deviceIds(assignments),
      meta,
      warnings,
    );
    return { experiment: await ExperimentService.dto(id), configs, commandIds: [], warnings };
  }

  /** READY -> RUNNING: every device must have applied the config and be online; then SET_MODE EXPERIMENT. */
  static async start(
    subject: CommandSubject,
    id: string,
    meta: AuditMeta = {},
  ): Promise<ExperimentActionResultDto> {
    const { exp, assignments } = await ExperimentService.load(id);
    if (exp.status !== "READY") {
      throw err(409, "EXPERIMENT_INVALID_STATE", `Only a READY experiment can be started (it is ${exp.status})`, {
        status: exp.status,
      });
    }
    if (exp.endsAt.getTime() <= Date.now()) throw err(400, "VALIDATION_FAILED", "The experiment period has already ended");
    const devices = ExperimentService.deviceIds(assignments);

    const notReady: { deviceId: string; reasons: string[] }[] = [];
    for (const deviceId of devices) {
      const r = await ReadinessService.forDevice(deviceId);
      const state = await DeviceStateService.get(deviceId);
      const reasons: string[] = [...(r.experiment.experimentId === id ? r.experiment.reasons : ["NO_READY_EXPERIMENT"])];
      if (!state || state.liveness === "OFFLINE") reasons.push("DEVICE_OFFLINE");
      else if (state.liveness !== "ONLINE") reasons.push("DEVICE_STALE");
      if (reasons.length > 0) notReady.push({ deviceId, reasons });
    }
    if (notReady.length > 0) {
      throw err(409, "EXPERIMENT_NOT_CONFIGURED", "Not every device is ready for the experiment", { devices: notReady });
    }

    await ExperimentService.transition(id, ["READY"], "RUNNING");
    const { commandIds, warnings } = await ExperimentService.sendModes(subject, devices, "EXPERIMENT", meta);
    if (warnings.length > 0) {
      // Do not report RUNNING when a device did not get its command, and do not leave the
      // devices that did switch parked in EXPERIMENT mode (relay commands are blocked there).
      await ExperimentService.sendModes(subject, ExperimentService.switched(devices, warnings), "MANUAL", meta);
      await prisma.experiment.updateMany({ where: { id, status: "RUNNING" }, data: { status: "READY" } });
      throw err(409, "EXPERIMENT_NOT_CONFIGURED", "A device could not be switched to EXPERIMENT mode", {
        devices: warnings,
        commandIds,
      });
    }
    await ExperimentService.audit(subject, meta, "EXPERIMENT_STARTED", exp, { devices, commandIds });
    ExperimentService.emit(exp, "RUNNING", devices);
    return { experiment: await ExperimentService.dto(id), configs: [], commandIds, warnings: [] };
  }

  /** RUNNING -> PAUSED (O-15 default: SET_MODE MAINTENANCE). */
  static async pause(
    subject: CommandSubject,
    id: string,
    meta: AuditMeta = {},
  ): Promise<ExperimentActionResultDto> {
    const { exp, assignments } = await ExperimentService.load(id);
    if (exp.status !== "RUNNING") {
      throw err(409, "EXPERIMENT_INVALID_STATE", `Only a RUNNING experiment can be paused (it is ${exp.status})`, {
        status: exp.status,
      });
    }
    const devices = ExperimentService.deviceIds(assignments);
    // All or nothing: an offline device would keep running the experiment while the UI says PAUSED.
    await ExperimentService.requireOnline(devices);
    await ExperimentService.transition(id, ["RUNNING"], "PAUSED");
    const { commandIds, warnings } = await ExperimentService.sendModes(subject, devices, "MAINTENANCE", meta);
    if (warnings.length > 0) {
      await ExperimentService.sendModes(subject, ExperimentService.switched(devices, warnings), "EXPERIMENT", meta);
      await prisma.experiment.updateMany({ where: { id, status: "PAUSED" }, data: { status: "RUNNING" } });
      throw err(409, "EXPERIMENT_MODE_SWITCH_FAILED", "A device could not be switched to MAINTENANCE mode", {
        devices: warnings,
        commandIds,
      });
    }
    await ExperimentService.audit(subject, meta, "EXPERIMENT_PAUSED", exp, { devices, commandIds, warnings });
    ExperimentService.emit(exp, "PAUSED", devices);
    return { experiment: await ExperimentService.dto(id), configs: [], commandIds, warnings };
  }

  /** PAUSED -> RUNNING (O-15 default: SET_MODE EXPERIMENT). */
  static async resume(
    subject: CommandSubject,
    id: string,
    meta: AuditMeta = {},
  ): Promise<ExperimentActionResultDto> {
    const { exp, assignments } = await ExperimentService.load(id);
    if (exp.status !== "PAUSED") {
      throw err(409, "EXPERIMENT_INVALID_STATE", `Only a PAUSED experiment can be resumed (it is ${exp.status})`, {
        status: exp.status,
      });
    }
    if (exp.endsAt.getTime() <= Date.now()) throw err(400, "VALIDATION_FAILED", "The experiment period has already ended");
    const devices = ExperimentService.deviceIds(assignments);
    await ExperimentService.requireOnline(devices);
    await ExperimentService.transition(id, ["PAUSED"], "RUNNING");
    const { commandIds, warnings } = await ExperimentService.sendModes(subject, devices, "EXPERIMENT", meta);
    if (warnings.length > 0) {
      await ExperimentService.sendModes(subject, ExperimentService.switched(devices, warnings), "MAINTENANCE", meta);
      await prisma.experiment.updateMany({ where: { id, status: "RUNNING" }, data: { status: "PAUSED" } });
      throw err(409, "EXPERIMENT_MODE_SWITCH_FAILED", "A device could not be switched to EXPERIMENT mode", {
        devices: warnings,
        commandIds,
      });
    }
    await ExperimentService.audit(subject, meta, "EXPERIMENT_RESUMED", exp, { devices, commandIds, warnings });
    ExperimentService.emit(exp, "RUNNING", devices);
    return { experiment: await ExperimentService.dto(id), configs: [], commandIds, warnings };
  }

  /** READY | RUNNING | PAUSED -> STOPPED. Devices that ran it go back to MANUAL (O-15 default). */
  static async stop(
    subject: CommandSubject,
    id: string,
    meta: AuditMeta = {},
  ): Promise<ExperimentActionResultDto> {
    return ExperimentService.finish(subject, id, "STOPPED", "EXPERIMENT_STOPPED", meta);
  }

  /** RUNNING | PAUSED -> COMPLETED when the experiment period is over (called by the sweeper). */
  static async complete(id: string): Promise<ExperimentActionResultDto | null> {
    const { exp } = await ExperimentService.load(id);
    if (exp.status !== "RUNNING" && exp.status !== "PAUSED" && exp.status !== "READY") return null;
    const subject: CommandSubject = {
      userId: exp.createdById ?? "",
      email: exp.createdByEmail ?? "system",
      permissions: [],
      roles: [],
    };
    return ExperimentService.finish(
      subject,
      id,
      exp.status === "READY" ? "STOPPED" : "COMPLETED",
      "EXPERIMENT_COMPLETED",
      {},
      true,
    );
  }

  private static async finish(
    subject: CommandSubject,
    id: string,
    to: "STOPPED" | "COMPLETED",
    action: string,
    meta: AuditMeta,
    system = false,
  ): Promise<ExperimentActionResultDto> {
    const { exp, assignments } = await ExperimentService.load(id);
    const wasRunning = exp.status === "RUNNING" || exp.status === "PAUSED";
    await ExperimentService.transition(id, ["READY", "RUNNING", "PAUSED"], to);
    const devices = ExperimentService.deviceIds(assignments);

    const warnings: ExperimentWarningDto[] = [];
    let commandIds: string[] = [];
    if (wasRunning) {
      if (subject.userId === "") {
        warnings.push(...devices.map((deviceId) => ({ deviceId, code: "NO_ISSUER", message: "No user to issue the mode command" })));
      } else {
        const sent = await ExperimentService.sendModes(subject, devices, "MANUAL", meta);
        commandIds = sent.commandIds;
        warnings.push(...sent.warnings);
      }
    }
    const configs = await ExperimentService.sendConfigs(subject, devices, meta, warnings);
    await ExperimentService.audit(subject, meta, action, exp, { devices, commandIds, warnings, automatic: system });
    ExperimentService.emit(exp, to, devices);
    return { experiment: await ExperimentService.dto(id), configs, commandIds, warnings };
  }

  // --------------------------------------------------------------- helpers

  /** Publishes the compiled config of each device; failures become warnings. */
  private static async sendConfigs(
    subject: CommandSubject,
    devices: string[],
    meta: AuditMeta,
    warnings: ExperimentWarningDto[] = [],
  ): Promise<DeviceConfigDto[]> {
    const configs: DeviceConfigDto[] = [];
    for (const deviceId of devices) {
      try {
        const res = await ConfigService.publishDevice(deviceId, {
          actor: subject.userId ? subject : undefined,
          ip: meta.ip ?? null,
          requestId: meta.requestId ?? null,
        });
        if (res) {
          configs.push(res.config);
          if (res.created) ConfigService.emitConfig(deviceId, null, null, null, res.config);
        }
      } catch (e) {
        logger.warn("experiment config publish failed", { deviceId, error: String(e) });
        warnings.push({
          deviceId,
          code: e instanceof AppError ? e.errorCode : "ERROR",
          message: e instanceof Error ? e.message : "Config could not be sent",
        });
      }
    }
    return configs;
  }

  /** 409 EXPERIMENT_CONFLICT when another READY/RUNNING/PAUSED experiment uses one of the devices. */
  private static async assertNoConflict(
    db: Pick<Prisma.TransactionClient, "experiment" | "experimentAssignment">,
    id: string,
    devices: string[],
  ): Promise<void> {
    const others = await db.experimentAssignment.findMany({
      where: { deviceId: { in: devices }, experimentId: { not: id } },
    });
    if (others.length === 0) return;
    const busy = await db.experiment.findMany({
      where: { id: { in: [...new Set(others.map((o) => o.experimentId))] }, status: { in: [...ACTIVE] } },
    });
    if (busy.length === 0) return;
    const taken = others.filter((o) => busy.some((b) => b.id === o.experimentId));
    throw err(409, "EXPERIMENT_CONFLICT", `A device is already used by experiment ${busy[0]?.code ?? "?"}`, {
      experiments: busy.map((b) => b.code),
      devices: [...new Set(taken.map((t) => t.deviceId))],
    });
  }

  /** Devices that got their command (not in `warnings`). */
  private static switched(devices: string[], warnings: ExperimentWarningDto[]): string[] {
    const failed = new Set(warnings.map((w) => w.deviceId));
    return devices.filter((d) => !failed.has(d));
  }

  /** 409 DEVICE_OFFLINE / DEVICE_STALE listing every device that is not ONLINE. */
  private static async requireOnline(devices: string[]): Promise<void> {
    const notOnline: { deviceId: string; reasons: string[] }[] = [];
    for (const deviceId of devices) {
      const state = await DeviceStateService.get(deviceId);
      if (!state || state.liveness === "OFFLINE") notOnline.push({ deviceId, reasons: ["DEVICE_OFFLINE"] });
      else if (state.liveness !== "ONLINE") notOnline.push({ deviceId, reasons: ["DEVICE_STALE"] });
    }
    if (notOnline.length > 0) {
      throw err(409, "DEVICE_OFFLINE", "Not every device of the experiment is online", { devices: notOnline });
    }
  }

  /** SET_MODE (source `experiment`) to every device; a device that refuses becomes a warning. */
  private static async sendModes(
    subject: CommandSubject,
    devices: string[],
    mode: Mode,
    meta: AuditMeta,
  ): Promise<{ commandIds: string[]; warnings: ExperimentWarningDto[] }> {
    const commandIds: string[] = [];
    const warnings: ExperimentWarningDto[] = [];
    for (const deviceId of devices) {
      try {
        const device = await prisma.device.findUnique({ where: { deviceId } });
        if (!device) throw err(404, "DEVICE_NOT_FOUND", `Device ${deviceId} not found`);
        const { command } = await CommandService.submit(
          subject,
          device.id,
          { action: "SET_MODE", mode },
          undefined,
          { requestId: meta.requestId ?? null, ip: meta.ip ?? null },
          { source: "experiment", internal: true },
        );
        commandIds.push(command.commandId);
      } catch (e) {
        warnings.push({
          deviceId,
          code: e instanceof AppError ? e.errorCode : "ERROR",
          message: e instanceof Error ? e.message : "Mode command failed",
        });
      }
    }
    return { commandIds, warnings };
  }

  /**
   * Safety net for stop/complete while a device was offline (it keeps EXPERIMENT mode and
   * blocks manual relay commands): ONLINE devices in EXPERIMENT mode that no READY, RUNNING
   * or PAUSED experiment uses get SET_MODE MANUAL (source `system`). Skips a device with a
   * SET_MODE command in flight or finished in the last RECONCILE_QUIET_MS (its snapshot may
   * be behind). Called by the experiment sweeper. Returns the devices that got a command.
   */
  static async reconcileModes(now: Date = new Date()): Promise<string[]> {
    if (!MqttClient.isConnected()) return [];
    const parked = await prisma.deviceStatus.findMany({
      where: { mode: "EXPERIMENT", liveness: "ONLINE" },
      select: { deviceId: true },
    });
    if (parked.length === 0) return [];
    const ids = parked.map((p) => p.deviceId);
    const owned = await prisma.experimentAssignment.findMany({
      where: { deviceId: { in: ids }, experiment: { status: { in: [...ACTIVE] } } },
      select: { deviceId: true },
    });
    const covered = new Set(owned.map((o) => o.deviceId));
    const quietSince = new Date(now.getTime() - RECONCILE_QUIET_MS);

    const sent: string[] = [];
    for (const deviceId of ids) {
      if (covered.has(deviceId)) continue;
      const recent = await prisma.command.count({
        where: {
          deviceId,
          action: "SET_MODE",
          OR: [
            { status: { in: ["PENDING", "PUBLISHED", "ACCEPTED"] } },
            { completedAt: { gte: quietSince } },
          ],
        },
      });
      if (recent > 0) continue;
      try {
        const cmd = await CommandService.submitSystem(deviceId, { action: "SET_MODE", mode: "MANUAL" });
        sent.push(deviceId);
        await AuditService.record({
          action: "EXPERIMENT_MODE_RECONCILED",
          entity: "Command",
          entityId: cmd.commandId,
          actorType: "SYSTEM",
          data: { deviceId, from: "EXPERIMENT", to: "MANUAL", reason: "NO_ACTIVE_EXPERIMENT" },
        });
      } catch (e) {
        logger.warn("experiment mode reconcile failed", { deviceId, error: String(e) });
      }
    }
    return sent;
  }

  /** Experiments whose period is over and that still hold devices. */
  static async dueForCompletion(now: Date = new Date()): Promise<string[]> {
    const rows = await prisma.experiment.findMany({
      where: { status: { in: ["READY", "RUNNING", "PAUSED"] }, endsAt: { lt: now } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
