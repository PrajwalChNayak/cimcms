import {
  configWireSchema,
  findWindowOverlaps,
  MAX_CONFIG_PAYLOAD_BYTES,
  SCHEMA_VERSION,
  TIMEZONE,
  topicFor,
  TZ_OFFSET_MINUTES,
  weekMinuteLabel,
  type ConfigWire,
  type DeviceConfigDto,
  type DeviceType,
  type ScheduleWindow,
} from "@cimcms/contracts";
import MqttClient from "@/mqtt/mqtt.client";
import { RealtimeEmitter } from "@/realtime/realtime.emitter";
import prisma from "@models/prisma.client";
import { Prisma, type DeviceConfig } from "@prisma/client";
import AuditService from "@services/audit.service";
import { AppError } from "@utils/errors/custom.errors";
import logger from "@utils/logger.utils";

export interface ConfigActor {
  userId: string;
  email: string;
}

export interface CompileOptions {
  now?: Date;
  /** scheduleId -> version to treat as published although it is still a draft (publish dry run). */
  schedulePreview?: ReadonlyMap<string, number>;
  /** Experiment id to include although it is still DRAFT (publish dry run). */
  experimentPreview?: string;
}

export interface Compiled {
  auto: ConfigWire["auto"];
  experiment: ConfigWire["experiment"];
  sourceVersions: { scheduleId: string; version: number }[];
}

interface Prepared {
  wire: ConfigWire;
  compiled: Compiled;
  latest: DeviceConfig | null;
}

const err = (status: number, code: string, message: string, details?: unknown): AppError =>
  new AppError(message, status, code, details);

const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const sortWindows = (rules: unknown): ScheduleWindow[] =>
  ((rules ?? []) as ScheduleWindow[]).map((r) => ({
    days: [...r.days].sort((a, b) => a - b),
    on: r.on,
    off: r.off,
  }));

/** Parts of the config a device acts on; version and issue time are not compared. */
const semantic = (w: { auto?: unknown; experiment?: unknown }): string =>
  JSON.stringify({ auto: w.auto ?? null, experiment: w.experiment ?? null });

/**
 * Compiles, versions, publishes (retained, QoS 1) and tracks the per-device config
 * (plan T5.3). The `auto` block comes from published schedules of the rooms that own
 * the device's relays; the `experiment` block from the device's READY/RUNNING/PAUSED experiment.
 */
export default class ConfigService {
  static toDto(row: DeviceConfig): DeviceConfigDto {
    return {
      deviceId: row.deviceId,
      configVersion: row.configVersion,
      status: row.status,
      publishedAt: row.publishedAt.toISOString(),
      appliedAt: row.appliedAt?.toISOString() ?? null,
      reason: row.reason,
      sourceVersions: (row.sourceVersions ?? []) as DeviceConfigDto["sourceVersions"],
    };
  }

  // ---------------------------------------------------------------- compile

  static async compile(deviceId: string, opts: CompileOptions = {}): Promise<Compiled> {
    const assignments = await prisma.roomChannelAssignment.findMany({
      where: { deviceId },
      orderBy: { relay: "asc" },
    });
    const roomIds = [...new Set(assignments.map((a) => a.roomId))];
    const preview = opts.schedulePreview ?? new Map<string, number>();

    // ---- AUTO block
    const schedules = roomIds.length
      ? await prisma.schedule.findMany({
          where: {
            roomId: { in: roomIds },
            OR: [{ status: "PUBLISHED" }, { id: { in: [...preview.keys()] } }],
          },
        })
      : [];
    const used = schedules
      .map((s) => ({ s, version: preview.get(s.id) ?? s.publishedVersion }))
      .filter((x): x is { s: (typeof schedules)[number]; version: number } => x.version !== null);
    const versions = used.length
      ? await prisma.scheduleVersion.findMany({
          where: { OR: used.map((u) => ({ scheduleId: u.s.id, version: u.version })) },
        })
      : [];
    const byRoom = new Map<string, (typeof versions)[number]>();
    for (const u of used) {
      const v = versions.find((x) => x.scheduleId === u.s.id && x.version === u.version);
      if (v) byRoom.set(u.s.roomId, v);
    }

    const channels: { relay: number; windows: ScheduleWindow[] }[] = [];
    for (const a of assignments) {
      const v = byRoom.get(a.roomId);
      if (!v) continue;
      const windows = sortWindows(v.rules);
      const overlaps = findWindowOverlaps(windows);
      if (overlaps.length > 0) {
        throw err(400, "SCHEDULE_OVERLAP", `Schedule windows overlap on relay ${a.relay} of ${deviceId}`, {
          deviceId,
          relay: a.relay,
          overlaps: overlaps.map((o) => ({
            windowA: o.windowA,
            windowB: o.windowB,
            from: weekMinuteLabel(o.from),
            to: weekMinuteLabel(o.to),
          })),
        });
      }
      channels.push({ relay: a.relay, windows });
    }

    let auto: ConfigWire["auto"] = null;
    const sourceVersions: Compiled["sourceVersions"] = [];
    if (channels.length > 0) {
      const used2 = [...byRoom.values()];
      const from = used2.map((v) => v.effectiveFrom).sort().at(-1) as string;
      const tos = used2.map((v) => v.effectiveTo).filter((t): t is string => t !== null).sort();
      // One date range per device on the wire: latest start, earliest end.
      const to = tos.length > 0 ? (tos[0] as string) : null;
      if (to !== null && from > to) {
        throw err(400, "VALIDATION_FAILED", "The effective dates of the schedules on this device do not overlap", {
          deviceId,
        });
      }
      auto = { effective_from: from, effective_to: to, channels };
      for (const v of used2) sourceVersions.push({ scheduleId: v.scheduleId, version: v.version });
    }

    // ---- EXPERIMENT block
    const experiment = await ConfigService.compileExperiment(deviceId, opts);
    return { auto, experiment, sourceVersions };
  }

  private static async compileExperiment(
    deviceId: string,
    opts: CompileOptions,
  ): Promise<ConfigWire["experiment"]> {
    const mine = await prisma.experimentAssignment.findMany({ where: { deviceId } });
    if (mine.length === 0) return null;
    const ids = [...new Set(mine.map((m) => m.experimentId))];
    const experiments = await prisma.experiment.findMany({
      where: {
        id: { in: ids },
        OR: [
          { status: { in: ["READY", "RUNNING", "PAUSED"] } },
          ...(opts.experimentPreview ? [{ id: opts.experimentPreview }] : []),
        ],
      },
      orderBy: { startsAt: "asc" },
    });
    if (experiments.length === 0) return null;
    if (experiments.length > 1) {
      throw err(409, "EXPERIMENT_CONFLICT", `More than one experiment is active on ${deviceId}`, {
        experiments: experiments.map((e) => e.code),
      });
    }
    const exp = experiments[0] as (typeof experiments)[number];
    const channels = new Map<number, ScheduleWindow[]>();
    for (const a of mine.filter((m) => m.experimentId === exp.id)) {
      if (channels.has(a.relay)) {
        throw err(409, "EXPERIMENT_CONFLICT", `Relay ${a.relay} of ${deviceId} is used twice in the experiment`);
      }
      const windows = sortWindows(a.windows);
      const overlaps = findWindowOverlaps(windows);
      if (overlaps.length > 0) {
        throw err(400, "SCHEDULE_OVERLAP", `Experiment windows overlap on relay ${a.relay} of ${deviceId}`, {
          scope: "EXPERIMENT",
          deviceId,
          relay: a.relay,
          overlaps: overlaps.map((o) => ({
            windowA: o.windowA,
            windowB: o.windowB,
            from: weekMinuteLabel(o.from),
            to: weekMinuteLabel(o.to),
          })),
        });
      }
      channels.set(a.relay, windows);
    }
    return {
      experiment_id: exp.id,
      starts_at_utc: exp.startsAt.toISOString(),
      ends_at_utc: exp.endsAt.toISOString(),
      channels: [...channels.entries()]
        .sort(([a], [b]) => a - b)
        .map(([relay, windows]) => ({ relay, windows })),
    };
  }

  /** Compiles the device config as it would be sent next and checks size and schema. */
  static async prepare(deviceId: string, opts: CompileOptions = {}): Promise<Prepared> {
    const compiled = await ConfigService.compile(deviceId, opts);
    const latest = await prisma.deviceConfig.findFirst({
      where: { deviceId },
      orderBy: { configVersion: "desc" },
    });
    const wire = configWireSchema.parse({
      schema_version: SCHEMA_VERSION,
      device_id: deviceId,
      config_version: (latest?.configVersion ?? 0) + 1,
      issued_at_utc: (opts.now ?? new Date()).toISOString(),
      timezone: TIMEZONE,
      tz_offset_minutes: TZ_OFFSET_MINUTES,
      auto: compiled.auto,
      experiment: compiled.experiment,
    });
    const bytes = Buffer.byteLength(JSON.stringify(wire), "utf8");
    if (bytes > MAX_CONFIG_PAYLOAD_BYTES) {
      throw err(
        400,
        "SCHEDULE_TOO_LARGE",
        `The configuration for ${deviceId} is ${bytes} bytes; the device accepts at most ${MAX_CONFIG_PAYLOAD_BYTES}`,
        { deviceId, bytes, max: MAX_CONFIG_PAYLOAD_BYTES },
      );
    }
    return { wire, compiled, latest };
  }

  // ---------------------------------------------------------------- publish

  /**
   * Creates the next DeviceConfig of a device and publishes it retained, QoS 1.
   * Returns null when there is nothing to send (no auto/experiment block and never configured)
   * and `created: false` when the device already holds an equal config.
   */
  static async publishDevice(
    deviceId: string,
    opts: CompileOptions & { actor?: ConfigActor; ip?: string | null; requestId?: string | null } = {},
  ): Promise<{ config: DeviceConfigDto; created: boolean } | null> {
    const { wire, compiled, latest } = await ConfigService.prepare(deviceId, opts);

    if (!latest && wire.auto === null && wire.experiment === null) return null;
    if (
      latest &&
      latest.status !== "REJECTED" &&
      semantic(wire) === semantic(latest.payload as { auto?: unknown; experiment?: unknown })
    ) {
      return { config: ConfigService.toDto(latest), created: false };
    }
    if (!MqttClient.isConnected()) throw err(503, "MQTT_UNAVAILABLE", "Message broker is not connected");

    const device = await prisma.device.findUnique({ where: { deviceId } });
    if (!device) throw err(404, "DEVICE_NOT_FOUND", `Device ${deviceId} not found`);

    let row: DeviceConfig;
    try {
      row = await prisma.deviceConfig.create({
        data: {
          deviceId,
          configVersion: wire.config_version,
          payload: wire as unknown as Prisma.InputJsonValue,
          sourceVersions: compiled.sourceVersions as unknown as Prisma.InputJsonValue,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw err(409, "EXPERIMENT_CONFLICT", `Another configuration was published for ${deviceId} at the same time; try again`);
      }
      throw e;
    }

    try {
      await MqttClient.publish(
        topicFor(device.deviceType as DeviceType, deviceId, "config"),
        JSON.stringify(wire),
        { qos: 1, retain: true }, // retained: a rebooting device gets its config again
      );
    } catch (e) {
      logger.warn("config publish failed", { deviceId, error: String(e) });
      await prisma.deviceConfig.updateMany({
        where: { id: row.id, status: "PUBLISHED" },
        data: { status: "REJECTED", reason: "PUBLISH_FAILED" },
      });
    }
    const fresh = (await prisma.deviceConfig.findUnique({ where: { id: row.id } })) ?? row;

    await AuditService.record({
      action: "DEVICE_CONFIG_PUBLISHED",
      entity: "DeviceConfig",
      entityId: fresh.id,
      actorId: opts.actor?.userId ?? null,
      actorEmail: opts.actor?.email ?? null,
      data: { deviceId, configVersion: fresh.configVersion, status: fresh.status },
      ip: opts.ip ?? null,
      requestId: opts.requestId ?? null,
    });
    return { config: ConfigService.toDto(fresh), created: true };
  }

  /**
   * Re-sends the config of devices whose inputs changed (room channels, archived schedule,
   * experiment lifecycle). Never throws: failures are logged and returned per device.
   */
  static async recompileDevices(
    deviceIds: readonly string[],
    opts: { actor?: ConfigActor; ip?: string | null; requestId?: string | null } = {},
  ): Promise<{ deviceId: string; config: DeviceConfigDto | null; error?: string }[]> {
    const out: { deviceId: string; config: DeviceConfigDto | null; error?: string }[] = [];
    for (const deviceId of new Set(deviceIds)) {
      try {
        const res = await ConfigService.publishDevice(deviceId, opts);
        out.push({ deviceId, config: res?.config ?? null });
        if (res?.created) ConfigService.emitConfig(deviceId, null, null, null, res.config);
      } catch (e) {
        logger.warn("config recompile failed", { deviceId, error: String(e) });
        out.push({ deviceId, config: null, error: e instanceof AppError ? e.errorCode : "ERROR" });
      }
    }
    return out;
  }

  static emitConfig(
    deviceId: string,
    scheduleId: string | null,
    roomId: string | null,
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | null,
    ...configs: DeviceConfigDto[]
  ): void {
    RealtimeEmitter.scheduleUpdated(deviceId, { scheduleId, roomId, status, configs });
  }

  // -------------------------------------------------- device feedback (ingest)

  /** `CONFIG_APPLIED` event: { config_version, result: APPLIED | REJECTED, reason? }. */
  static async onConfigEvent(deviceId: string, data: Record<string, unknown>): Promise<void> {
    const version = data["config_version"];
    const result = data["result"];
    if (typeof version !== "number" || !Number.isInteger(version)) return;
    if (result !== "APPLIED" && result !== "REJECTED") return;
    const reason = typeof data["reason"] === "string" ? data["reason"].slice(0, 64) : null;
    const { count } = await prisma.deviceConfig.updateMany({
      where: { deviceId, configVersion: version, status: "PUBLISHED" },
      data:
        result === "APPLIED"
          ? { status: "APPLIED", appliedAt: new Date() }
          : { status: "REJECTED", reason: reason ?? "DEVICE_REJECTED" },
    });
    if (count === 0) return;
    const row = await prisma.deviceConfig.findFirst({ where: { deviceId, configVersion: version } });
    if (row) ConfigService.emitConfig(deviceId, null, null, null, ConfigService.toDto(row));
  }

  /** Telemetry `config_version >= version` also counts as applied (plan T5.3). */
  static async onTelemetryConfigVersion(deviceId: string, reported: number): Promise<void> {
    const pending = await prisma.deviceConfig.findMany({
      where: { deviceId, status: "PUBLISHED", configVersion: { lte: reported } },
    });
    if (pending.length === 0) return;
    await prisma.deviceConfig.updateMany({
      where: { deviceId, status: "PUBLISHED", configVersion: { lte: reported } },
      data: { status: "APPLIED", appliedAt: new Date() },
    });
    const rows = await prisma.deviceConfig.findMany({
      where: { id: { in: pending.map((p) => p.id) } },
    });
    ConfigService.emitConfig(deviceId, null, null, null, ...rows.map((r) => ConfigService.toDto(r)));
  }

  static async latestFor(deviceId: string): Promise<DeviceConfigDto | null> {
    const row = await prisma.deviceConfig.findFirst({
      where: { deviceId },
      orderBy: { configVersion: "desc" },
    });
    return row ? ConfigService.toDto(row) : null;
  }
}
