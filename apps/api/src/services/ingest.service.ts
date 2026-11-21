import {
  ackWireSchema,
  DEVICE_MODES,
  eventWireSchema,
  parseStatusPayload,
  RELAY_CHANGE_SOURCES,
  relayChangedDataSchema,
  telemetryWireSchema,
  telemetryWireToPoint,
  telemetryWireToState,
  type AckWire,
  type EventWire,
  type RelayChangeSource,
  type TelemetryWire,
  type TopicKind,
} from "@cimcms/contracts";
import { getDriver } from "@/drivers/driver.registry";
import { RealtimeEmitter } from "@/realtime/realtime.emitter";
import prisma from "@models/prisma.client";
import type { Prisma } from "@prisma/client";
import TelemetryRepository from "@repositories/telemetry.repository";
import CommandService from "@services/command.service";
import ConfigService from "@services/config.service";
import DeviceStateService, { type DeviceStatusPatch } from "@services/devicestate.service";
import logger from "@utils/logger.utils";

export interface IngestMeta {
  retained: boolean;
}

/** Window used to attribute a relay change to a command or a device event (plan T2.6). */
const ATTRIBUTION_WINDOW_MS = 10_000;
/** Device clock further than this from server time is not trusted for the time-series timestamp. */
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

interface Rejection {
  kind: TopicKind;
  issues: { path: string; message: string; code?: string }[];
  raw: string;
}

interface SafeParser<T> {
  safeParse(v: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string; code: string }[] } };
}

const isMode = (v: unknown): v is (typeof DEVICE_MODES)[number] =>
  typeof v === "string" && (DEVICE_MODES as readonly string[]).includes(v);

/** Handles every inbound device message. One message at a time per device. */
export default class IngestService {
  private static queues = new Map<string, Promise<void>>();

  /**
   * Entry point used by the MQTT dispatcher. Messages of one device are
   * processed strictly in arrival order (an ack must not overtake its event).
   * Never rejects: a failing message is logged and the next one runs.
   */
  static handle(
    kind: TopicKind,
    deviceId: string,
    type: string,
    raw: string,
    meta: IngestMeta,
  ): Promise<void> {
    const previous = IngestService.queues.get(deviceId) ?? Promise.resolve();
    const next = previous.then(async () => {
      try {
        await IngestService.process(kind, deviceId, type, raw, meta);
      } catch (err) {
        logger.error("ingest failed", { kind, deviceId, error: String(err) });
      }
    });
    IngestService.queues.set(deviceId, next);
    void next.then(() => {
      if (IngestService.queues.get(deviceId) === next) IngestService.queues.delete(deviceId);
    });
    return next;
  }

  /** Resolves when all queued messages have been processed (tests, shutdown). */
  static async idle(): Promise<void> {
    await Promise.all([...IngestService.queues.values()]);
  }

  private static async process(
    kind: TopicKind,
    deviceId: string,
    type: string,
    raw: string,
    meta: IngestMeta,
  ): Promise<void> {
    switch (kind) {
      case "status":
        return IngestService.onStatus(deviceId, type, raw, meta);
      case "telemetry":
        return IngestService.onTelemetry(deviceId, type, raw);
      case "event":
        return IngestService.onEvent(deviceId, type, raw);
      case "ack":
        return IngestService.onAck(deviceId, type, raw);
      default:
        logger.debug("ingest: kind not handled", { kind, deviceId });
    }
  }

  // ---------------------------------------------------------------- helpers

  private static async reject(deviceId: string, r: Rejection): Promise<void> {
    await DeviceStateService.recordBackendEvent(deviceId, "SCHEMA_REJECTED", {
      kind: r.kind,
      issues: r.issues.slice(0, 5),
      sample: r.raw.slice(0, 200),
    });
    logger.warn("SCHEMA_REJECTED", { deviceId, kind: r.kind });
  }

  /** Parses JSON and validates with `schema`; on failure records SCHEMA_REJECTED and returns null. */
  private static async parseJson<T extends { device_id: string }>(
    kind: TopicKind,
    deviceId: string,
    raw: string,
    schema: SafeParser<T>,
  ): Promise<T | null> {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      await IngestService.reject(deviceId, {
        kind,
        issues: [{ path: "", message: "Invalid JSON" }],
        raw,
      });
      return null;
    }
    const res = schema.safeParse(json);
    if (!res.success) {
      const issues = res.error.issues.slice(0, 5).map((i) => ({
        path: i.path.map(String).join("."),
        message: i.message,
        code: i.code,
      }));
      await IngestService.reject(deviceId, { kind, issues, raw });
      return null;
    }
    if (res.data.device_id !== deviceId) {
      await IngestService.reject(deviceId, {
        kind,
        issues: [{ path: "device_id", message: "device_id does not match topic" }],
        raw,
      });
      return null;
    }
    return res.data;
  }

  // ----------------------------------------------------------------- status

  private static async onStatus(
    deviceId: string,
    type: string,
    raw: string,
    meta: IngestMeta,
  ): Promise<void> {
    // An empty payload clears a retained message on the broker: nothing to ingest.
    if (raw.trim() === "") return;

    const status = parseStatusPayload(raw, deviceId);
    if (!status) {
      await IngestService.reject(deviceId, {
        kind: "status",
        issues: [{ path: "", message: "Not a valid status payload" }],
        raw,
      });
      return;
    }

    const now = new Date();
    const patch: DeviceStatusPatch = { lastStatusAt: now };
    // A retained message is history, not proof the device is alive right now.
    if (!meta.retained && status.state === "online") patch.lastSeenAt = now;
    if (status.firmwareVersion !== undefined) patch.firmwareVersion = status.firmwareVersion;
    if (status.mode !== undefined) patch.mode = status.mode;
    if (status.bootId !== undefined) patch.bootId = status.bootId;

    let requestStatus = false;
    let liveness: "ONLINE" | "OFFLINE" | "UNKNOWN";
    if (status.state === "offline") {
      liveness = "OFFLINE";
    } else if (meta.retained) {
      const current = await DeviceStateService.get(deviceId);
      liveness = current?.liveness === "ONLINE" ? "ONLINE" : "UNKNOWN";
      requestStatus = true;
    } else {
      liveness = "ONLINE";
    }

    const { after } = await DeviceStateService.apply(deviceId, type, patch, liveness);
    DeviceStateService.emitStatus(after);

    if (requestStatus && IngestService.supportsRequestStatus(type)) {
      try {
        await CommandService.submitSystem(deviceId, "REQUEST_STATUS");
      } catch (err) {
        logger.warn("REQUEST_STATUS after retained online failed", { deviceId, error: String(err) });
      }
    }
  }

  private static supportsRequestStatus(type: string): boolean {
    try {
      return (getDriver(type).supportedActions as readonly string[]).includes("REQUEST_STATUS");
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------- telemetry

  private static async onTelemetry(deviceId: string, type: string, raw: string): Promise<void> {
    const wire = await IngestService.parseJson<TelemetryWire>(
      "telemetry",
      deviceId,
      raw,
      telemetryWireSchema,
    );
    if (!wire) return;

    const now = new Date();
    const state = telemetryWireToState(wire, now.toISOString());
    if (wire.relay_on_count !== state.relayOnCount) {
      logger.warn("relay_on_count mismatch", {
        deviceId,
        reported: wire.relay_on_count,
        computed: state.relayOnCount,
      });
    }

    const stored = await DeviceStateService.get(deviceId);
    const pointTs = IngestService.timeSeriesTs(wire, now);
    const insertPoint = async (): Promise<void> => {
      try {
        await TelemetryRepository.insert({
          ts: pointTs,
          deviceId,
          type,
          mode: wire.mode,
          simulationMode: wire.simulation_mode,
          relayStates: state.relayStates,
          relayOnCount: state.relayOnCount,
          rssiDbm: wire.connectivity.rssi_dbm ?? null,
          wifiConnected: wire.connectivity.wifi_connected,
          mqttConnected: wire.connectivity.mqtt_connected,
          rtcValid: wire.rtc?.valid ?? null,
          seq: wire.seq ?? null,
          bootId: wire.boot_id ?? null,
        });
      } catch (err) {
        logger.error("telemetry insert failed", { deviceId, error: String(err) });
      }
    };

    // Out-of-order guard: same boot, sequence not newer than the last applied one.
    if (
      stored &&
      wire.boot_id !== undefined &&
      wire.boot_id === stored.bootId &&
      wire.seq !== undefined &&
      stored.lastSeq !== null &&
      wire.seq <= stored.lastSeq
    ) {
      await insertPoint();
      return;
    }

    // Relay diff against the stored snapshot (skipped for the first telemetry).
    const previousStates = stored?.relayStates ?? [];
    const changed: number[] = [];
    if (previousStates.length > 0) {
      state.relayStates.forEach((on, i) => {
        if (previousStates[i] !== on) changed.push(i);
      });
    }
    if (changed.length > 0) {
      const bootChanged =
        wire.boot_id !== undefined && stored?.bootId != null && wire.boot_id !== stored.bootId;
      await IngestService.recordRelayChanges(deviceId, changed, state.relayStates, {
        bootChanged,
        simulation: wire.simulation_mode,
        at: pointTs,
        now,
      });
    }

    const patch: DeviceStatusPatch = {
      lastSeenAt: now,
      lastTelemetryAt: now,
      lastSeq: wire.seq ?? null,
      bootId: state.bootId,
      firmwareVersion: state.firmwareVersion,
      mode: state.mode,
      modeStatus: state.modeStatus,
      simulationMode: state.simulationMode,
      relayStates: state.relayStates,
      relayOnCount: state.relayOnCount,
      configVersion: state.configVersion,
      autoReady: state.autoReady,
    };
    if (state.connectivity) patch.connectivity = state.connectivity as Prisma.InputJsonValue;
    if (state.rtc) patch.rtc = state.rtc as Prisma.InputJsonValue;

    const { after } = await DeviceStateService.apply(deviceId, type, patch, "ONLINE");
    await insertPoint();
    if (state.configVersion !== null) {
      try {
        await ConfigService.onTelemetryConfigVersion(deviceId, state.configVersion);
      } catch (err) {
        logger.error("config version feedback failed", { deviceId, error: String(err) });
      }
    }

    RealtimeEmitter.telemetry(deviceId, telemetryWireToPoint(wire));
    if (changed.length > 0) {
      RealtimeEmitter.relayState(deviceId, {
        relayStates: after.relayStates,
        relayOnCount: after.relayOnCount,
        simulationMode: wire.simulation_mode,
      });
    }
    DeviceStateService.emitStatus(after);
  }

  /** Device timestamp when it can be trusted, otherwise server receive time. */
  private static timeSeriesTs(wire: TelemetryWire, now: Date): Date {
    const device = new Date(wire.timestamp_utc);
    if (wire.rtc?.valid === false) return now;
    if (Number.isNaN(device.getTime())) return now;
    if (Math.abs(device.getTime() - now.getTime()) > MAX_CLOCK_SKEW_MS) return now;
    return device;
  }

  /**
   * The telemetry diff is the only writer of RelayStateChange. The source is
   * inferred: boot, then a just-executed command, then a device event, else UNKNOWN.
   */
  private static async recordRelayChanges(
    deviceId: string,
    changed: number[],
    newStates: boolean[],
    ctx: { bootChanged: boolean; simulation: boolean; at: Date; now: Date },
  ): Promise<void> {
    const since = new Date(ctx.now.getTime() - ATTRIBUTION_WINDOW_MS);
    let commands: { commandId: string; action: string; params: Prisma.JsonValue }[] = [];
    let events: { data: Prisma.JsonValue }[] = [];
    if (!ctx.bootChanged) {
      commands = await prisma.command.findMany({
        where: { deviceId, status: "EXECUTED", completedAt: { gte: since } },
        orderBy: { completedAt: "desc" },
        select: { commandId: true, action: true, params: true },
      });
      events = await prisma.deviceEvent.findMany({
        where: { deviceId, type: "RELAY_CHANGED", origin: "DEVICE", receivedAt: { gte: since } },
        orderBy: { receivedAt: "desc" },
        select: { data: true },
      });
    }

    const rows = changed.map((i) => {
      const relay = i + 1;
      const on = newStates[i] === true;
      const wanted = on ? "ON" : "OFF";
      let source: RelayChangeSource = "UNKNOWN";
      let commandId: string | null = null;

      if (ctx.bootChanged) {
        source = "BOOT";
      } else {
        const cmd = commands.find((c) => {
          const p = (c.params ?? {}) as { relay?: unknown; state?: unknown };
          if (c.action === "SET_RELAY") return p.relay === relay && p.state === wanted;
          if (c.action === "SET_ALL_RELAYS") return p.state === wanted;
          return false;
        });
        if (cmd) {
          source = "COMMAND";
          commandId = cmd.commandId;
        } else {
          for (const e of events) {
            const parsed = relayChangedDataSchema.safeParse(e.data);
            if (!parsed.success) continue;
            const d = parsed.data;
            if (d.relay !== relay || d.state !== wanted) continue;
            if (!(RELAY_CHANGE_SOURCES as readonly string[]).includes(d.source)) continue;
            source = d.source;
            commandId = d.command_id ?? null;
            break;
          }
        }
      }
      return { deviceId, relay, state: on, source, commandId, simulation: ctx.simulation, at: ctx.at };
    });
    await prisma.relayStateChange.createMany({ data: rows });
  }

  // ------------------------------------------------------------------ event

  private static async onEvent(deviceId: string, type: string, raw: string): Promise<void> {
    const wire = await IngestService.parseJson<EventWire>("event", deviceId, raw, eventWireSchema);
    if (!wire) return;

    const row = await prisma.deviceEvent.create({
      data: {
        deviceId,
        type: wire.type,
        origin: "DEVICE",
        data: wire.data as Prisma.InputJsonValue,
        deviceTs: new Date(wire.timestamp_utc),
      },
    });

    const patch: DeviceStatusPatch = { lastSeenAt: new Date() };
    const newMode = wire.type === "MODE_CHANGED" ? wire.data.mode : undefined;
    if (isMode(newMode)) patch.mode = newMode;

    const { after, livenessChanged } = await DeviceStateService.apply(deviceId, type, patch, "ONLINE");
    RealtimeEmitter.deviceEvent(deviceId, DeviceStateService.eventToDto(row));
    if (wire.type === "CONFIG_APPLIED") {
      try {
        await ConfigService.onConfigEvent(deviceId, wire.data);
      } catch (err) {
        logger.error("config event feedback failed", { deviceId, error: String(err) });
      }
    }
    if (isMode(newMode) || livenessChanged) DeviceStateService.emitStatus(after);
  }

  // -------------------------------------------------------------------- ack

  private static async onAck(deviceId: string, type: string, raw: string): Promise<void> {
    const wire = await IngestService.parseJson<AckWire>("ack", deviceId, raw, ackWireSchema);
    if (!wire) return;

    const { after, livenessChanged } = await DeviceStateService.apply(
      deviceId,
      type,
      { lastSeenAt: new Date() },
      "ONLINE",
    );
    if (livenessChanged) DeviceStateService.emitStatus(after);
    await CommandService.onAck(wire);
  }
}
