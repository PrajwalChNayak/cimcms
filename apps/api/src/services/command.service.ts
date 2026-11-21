import { randomUUID } from "node:crypto";
import {
  ackWireToAckDto,
  COMMAND_TIMEOUT_GRACE_MS,
  COMMAND_TTL_MS,
  commandToWire,
  commandWireSchema,
  MAX_INFLIGHT_COMMANDS_PER_DEVICE,
  NON_TERMINAL_COMMAND_STATUSES,
  topicFor,
  type AckWire,
  type CommandAction,
  type CommandDto,
  type CommandStatus,
  type DeviceType,
  type SubmitCommandBody,
} from "@cimcms/contracts";
import { getDriver, supportsAction } from "@/drivers/driver.registry";
import MqttClient from "@/mqtt/mqtt.client";
import { RealtimeEmitter } from "@/realtime/realtime.emitter";
import prisma from "@models/prisma.client";
import { Prisma, type Command } from "@prisma/client";
import CommandRepository from "@repositories/command.repository";
import AuditService from "@services/audit.service";
import DeviceStateService from "@services/devicestate.service";
import { AppError } from "@utils/errors/custom.errors";
import logger from "@utils/logger.utils";
import PaginationUtils from "@utils/pagination.utils";

export interface CommandSubject {
  userId: string;
  email: string;
  roles?: string[];
  permissions: string[];
}

export interface SubmitMeta {
  requestId?: string | null;
  ip?: string | null;
}

export interface SubmitResult {
  command: CommandDto;
  /** false when an existing command was returned for a repeated Idempotency-Key. */
  created: boolean;
}

export interface ListCommandsQuery {
  page: number;
  limit: number;
  status?: CommandStatus;
}

const NON_TERMINAL = NON_TERMINAL_COMMAND_STATUSES as unknown as readonly CommandStatus[];
const BEFORE_TERMINAL = NON_TERMINAL;
const TERMINAL_RESULTS = ["EXECUTED", "REJECTED", "EXPIRED", "DUPLICATE", "FAILED"] as const;

const err = (status: number, code: string, message: string): AppError =>
  new AppError(message, status, code);

const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const RELAY_ACTIONS: readonly string[] = ["SET_RELAY", "SET_ALL_RELAYS"];

/** Creates, publishes and tracks device commands (plan section 8). */
export default class CommandService {
  /** Overridable in tests (short TTL); production values come from the contracts. */
  static timing = { ttlMs: COMMAND_TTL_MS, graceMs: COMMAND_TIMEOUT_GRACE_MS };

  static setTiming(t: Partial<typeof CommandService.timing>): void {
    CommandService.timing = { ...CommandService.timing, ...t };
  }

  // ---------------------------------------------------------------- mapping

  static toDto(row: Command): CommandDto {
    return {
      commandId: row.commandId,
      deviceId: row.deviceId,
      action: row.action as CommandAction,
      params: (row.params ?? {}) as Record<string, unknown>,
      source: row.source as CommandDto["source"],
      status: row.status,
      reason: row.reason,
      lateResult: row.lateResult,
      issuedBy: row.issuedById ? { id: row.issuedById, email: row.issuedByEmail ?? "" } : null,
      issuedAt: row.issuedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      acks: row.acks.map((a) => ({
        result: a.result as CommandDto["acks"][number]["result"],
        ...(a.reason != null && { reason: a.reason }),
        ...(a.reportedState != null && {
          reportedState: a.reportedState as "ON" | "OFF",
        }),
        receivedAt: a.receivedAt.toISOString(),
        ...(a.deviceTs != null && { deviceTs: a.deviceTs.toISOString() }),
      })),
      simulation: row.simulation,
    };
  }

  /** Re-reads the command and pushes `command:updated`. Returns the fresh DTO. */
  private static async publishUpdate(commandId: string): Promise<CommandDto> {
    const row = await prisma.command.findUnique({ where: { commandId } });
    if (!row) throw err(404, "COMMAND_NOT_FOUND", "Command not found");
    const dto = CommandService.toDto(row);
    RealtimeEmitter.commandUpdated(dto);
    return dto;
  }

  // ----------------------------------------------------------------- submit

  private static async findByKey(
    key: string,
    subject: CommandSubject,
  ): Promise<SubmitResult | null> {
    const found = await prisma.command.findUnique({ where: { idempotencyKey: key } });
    if (!found) return null;
    if (found.issuedById !== subject.userId) {
      throw err(409, "IDEMPOTENCY_CONFLICT", "Idempotency-Key was already used by another user");
    }
    return { command: CommandService.toDto(found), created: false };
  }

  /**
   * Web command submit. Order of the checks is part of the contract (plan T2.8):
   * idempotency, device, action, bulk permission, liveness, mode policy,
   * in-flight limit, broker connection, then create + publish.
   */
  static async submit(
    subject: CommandSubject,
    deviceObjectId: string,
    body: SubmitCommandBody,
    idempotencyKey: string | undefined,
    meta: SubmitMeta = {},
  ): Promise<SubmitResult> {
    // 1. Idempotency
    if (idempotencyKey) {
      const existing = await CommandService.findByKey(idempotencyKey, subject);
      if (existing) return existing;
    }

    // 2. Device and action
    const device = await prisma.device.findUnique({ where: { id: deviceObjectId } });
    if (!device) throw err(404, "DEVICE_NOT_FOUND", "Device not found");
    const type = device.deviceType;
    const { action, ...params } = body;
    let known = true;
    try {
      getDriver(type);
    } catch {
      known = false;
    }
    if (!known || !supportsAction(type, action)) {
      throw err(400, "ACTION_NOT_SUPPORTED", `Device type ${type} does not support ${action}`);
    }

    // 3. Bulk permission
    if (action === "SET_ALL_RELAYS" && !subject.permissions.includes("DEVICE_COMMAND_BULK")) {
      throw err(403, "FORBIDDEN", "Missing permission DEVICE_COMMAND_BULK");
    }

    // 4. Liveness
    const state = await DeviceStateService.get(device.deviceId);
    if (!state || state.liveness === "OFFLINE") {
      throw err(409, "DEVICE_OFFLINE", "Device is offline");
    }
    if (state.liveness !== "ONLINE") {
      throw err(409, "DEVICE_STALE", "No recent data from device");
    }

    // 5. Mode policy (D-11)
    if (RELAY_ACTIONS.includes(action)) {
      switch (state.mode) {
        case "MANUAL":
          break;
        case "MAINTENANCE":
          if (!subject.permissions.includes("DEVICE_DIAGNOSTICS")) {
            throw err(409, "MODE_POLICY_BLOCKED", "Device is in MAINTENANCE mode");
          }
          break;
        case "AUTO":
        case "EXPERIMENT":
          throw err(409, "MODE_POLICY_BLOCKED", `Device is in ${state.mode} mode`);
        default:
          throw err(409, "DEVICE_STALE", "Device mode is unknown");
      }
    }

    // 6. In-flight limit
    const inflight = await prisma.command.count({
      where: { deviceId: device.deviceId, status: { in: [...NON_TERMINAL] } },
    });
    if (inflight >= MAX_INFLIGHT_COMMANDS_PER_DEVICE) {
      throw err(429, "DEVICE_BUSY", "Too many commands in flight for this device");
    }

    // 7. Broker
    if (!MqttClient.isConnected()) {
      throw err(503, "MQTT_UNAVAILABLE", "Message broker is not connected");
    }

    // 8-11. Create, publish, audit
    const commandId = randomUUID();
    const now = new Date();
    let row: Command;
    try {
      row = await prisma.command.create({
        data: {
          commandId,
          idempotencyKey: idempotencyKey ?? commandId,
          deviceId: device.deviceId,
          action,
          params: params as Prisma.InputJsonValue,
          source: "web",
          issuedById: subject.userId,
          issuedByEmail: subject.email,
          requestId: meta.requestId ?? null,
          status: "PENDING",
          issuedAt: now,
          expiresAt: new Date(now.getTime() + CommandService.timing.ttlMs),
        },
      });
    } catch (e) {
      if (idempotencyKey && isUniqueViolation(e)) {
        // Two requests with the same key raced: the other one won.
        const existing = await CommandService.findByKey(idempotencyKey, subject);
        if (existing) return existing;
      }
      throw e;
    }

    await CommandService.dispatch(row, type);
    const dto = await CommandService.publishUpdate(commandId);

    await AuditService.record({
      action: "COMMAND_SUBMITTED",
      entity: "Command",
      entityId: commandId,
      actorId: subject.userId,
      actorEmail: subject.email,
      data: { deviceId: device.deviceId, action, params, status: dto.status },
      ip: meta.ip ?? null,
      requestId: meta.requestId ?? null,
    });
    return { command: dto, created: true };
  }

  /**
   * Backend-originated command (source `system`): no issuer, no liveness or mode
   * checks, no audit. Used for REQUEST_STATUS after a retained `online` status.
   */
  static async submitSystem(deviceId: string, action: "REQUEST_STATUS"): Promise<CommandDto> {
    const device = await prisma.device.findUnique({ where: { deviceId } });
    if (!device) throw err(404, "DEVICE_NOT_FOUND", "Device not found");
    if (!MqttClient.isConnected()) {
      throw err(503, "MQTT_UNAVAILABLE", "Message broker is not connected");
    }
    const commandId = randomUUID();
    const now = new Date();
    const row = await prisma.command.create({
      data: {
        commandId,
        idempotencyKey: commandId,
        deviceId,
        action,
        params: {},
        source: "system",
        status: "PENDING",
        issuedAt: now,
        expiresAt: new Date(now.getTime() + CommandService.timing.ttlMs),
      },
    });
    await CommandService.dispatch(row, device.deviceType);
    return CommandService.publishUpdate(commandId);
  }

  /** Builds the wire message, validates it, publishes QoS 1 without retain, records the outcome. */
  private static async dispatch(row: Command, type: string): Promise<void> {
    const { commandId } = row;
    let payload: string;
    try {
      const wire = commandToWire({
        commandId,
        deviceId: row.deviceId,
        action: row.action as CommandAction,
        params: (row.params ?? {}) as Record<string, unknown>,
        source: row.source as "web" | "system",
        issuedAt: row.issuedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      });
      payload = JSON.stringify(commandWireSchema.parse(wire));
    } catch (e) {
      logger.error("command wire invalid", { commandId, error: String(e) });
      await CommandRepository.transition(commandId, ["PENDING"], {
        status: "PUBLISH_FAILED",
        reason: "INVALID_WIRE",
        completedAt: new Date(),
      });
      return;
    }

    try {
      await MqttClient.publish(topicFor(type as DeviceType, row.deviceId, "command"), payload, {
        qos: 1,
        retain: false, // never retain a command: it would be replayed
      });
    } catch (e) {
      logger.warn("command publish failed", { commandId, error: String(e) });
      await CommandRepository.transition(commandId, ["PENDING"], {
        status: "PUBLISH_FAILED",
        reason: "BROKER_ERROR",
        completedAt: new Date(),
      });
      return;
    }
    // Count 0 is fine: an ack already moved the command past PENDING.
    await CommandRepository.transition(commandId, ["PENDING"], {
      status: "PUBLISHED",
      publishedAt: new Date(),
    });
  }

  // ------------------------------------------------------------------- acks

  /** Applies a validated device ack (called by ingest). First terminal result wins. */
  static async onAck(wire: AckWire): Promise<void> {
    const row = await prisma.command.findUnique({ where: { commandId: wire.command_id } });
    if (!row || row.deviceId !== wire.device_id) {
      await DeviceStateService.recordBackendEvent(wire.device_id, "UNKNOWN_ACK", {
        commandId: wire.command_id,
        result: wire.result,
        reason: row ? "WRONG_DEVICE" : "NO_SUCH_COMMAND",
      });
      return;
    }

    const receivedAt = new Date();
    const dtoAck = ackWireToAckDto(wire, receivedAt.toISOString());
    const ack = {
      result: dtoAck.result,
      reason: dtoAck.reason ?? null,
      reportedState: dtoAck.reportedState ?? null,
      receivedAt,
      deviceTs: dtoAck.deviceTs ? new Date(dtoAck.deviceTs) : null,
    };

    if (wire.result === "ACCEPTED") {
      const n = await CommandRepository.transition(
        wire.command_id,
        ["PENDING", "PUBLISHED"],
        { status: "ACCEPTED" },
        ack,
      );
      if (n === 0) await CommandRepository.appendAck(wire.command_id, ack);
    } else if ((TERMINAL_RESULTS as readonly string[]).includes(wire.result)) {
      const n = await CommandRepository.transition(
        wire.command_id,
        BEFORE_TERMINAL,
        {
          status: wire.result as CommandStatus,
          reason: wire.reason ?? null,
          completedAt: receivedAt,
          simulation: wire.simulation_mode,
        },
        ack,
      );
      if (n === 0) {
        await CommandRepository.appendAck(wire.command_id, ack);
        // Late result after the backend gave up: status stays TIMEOUT.
        await prisma.command.updateMany({
          where: {
            commandId: wire.command_id,
            status: "TIMEOUT",
            // First late result wins; the field is absent (not null) until set.
            OR: [{ lateResult: null }, { lateResult: { isSet: false } }],
          },
          data: { lateResult: wire.result },
        });
      }
    }
    await CommandService.publishUpdate(wire.command_id);
  }

  // ---------------------------------------------------------------- timeout

  /**
   * Marks non-terminal commands that expired more than `graceMs` ago as TIMEOUT.
   * Returns the number of commands changed.
   */
  static async timeoutExpired(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - CommandService.timing.graceMs);
    const due = await prisma.command.findMany({
      where: { status: { in: [...NON_TERMINAL] }, expiresAt: { lt: cutoff } },
      select: { commandId: true },
    });
    let changed = 0;
    for (const { commandId } of due) {
      const n = await CommandRepository.transition(commandId, BEFORE_TERMINAL, {
        status: "TIMEOUT",
        completedAt: new Date(),
      });
      if (n > 0) {
        changed++;
        await CommandService.publishUpdate(commandId);
      }
    }
    return changed;
  }

  // ------------------------------------------------------------------ reads

  static async list(deviceObjectId: string, q: ListCommandsQuery) {
    const device = await prisma.device.findUnique({
      where: { id: deviceObjectId },
      select: { deviceId: true },
    });
    if (!device) throw err(404, "DEVICE_NOT_FOUND", "Device not found");
    const where: Prisma.CommandWhereInput = {
      deviceId: device.deviceId,
      ...(q.status && { status: q.status }),
    };
    const { skip, take } = PaginationUtils.getSkipTake(q.page, q.limit);
    const [rows, total] = await Promise.all([
      prisma.command.findMany({ where, orderBy: { issuedAt: "desc" }, skip, take }),
      prisma.command.count({ where }),
    ]);
    return PaginationUtils.getPaginationData(rows.map(CommandService.toDto), total, q.page, q.limit);
  }

  static async get(commandId: string): Promise<CommandDto> {
    const row = await prisma.command.findUnique({ where: { commandId } });
    if (!row) throw err(404, "COMMAND_NOT_FOUND", "Command not found");
    return CommandService.toDto(row);
  }
}
