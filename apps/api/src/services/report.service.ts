import { DEVICE_TYPES, type DeviceType } from "@cimcms/contracts";
import prisma from "@models/prisma.client";
import type { Device } from "@prisma/client";
import { AppError } from "@utils/errors/custom.errors";

/** D-17: store UTC, show Asia/Kolkata (UTC+05:30, no DST). */
export const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
export const MAX_RANGE_MS = 31 * DAY_MS;
const BATCH = 500;
const KNOWN_TYPES = Object.keys(DEVICE_TYPES) as DeviceType[];
const RELAY_TYPES = KNOWN_TYPES.filter((t) => DEVICE_TYPES[t].channelCount !== null);

export interface ReportRange {
  from: string;
  to: string;
  deviceId?: string;
}

export type CsvCell = string | number | boolean | null | undefined;

/** Quote a CSV field and defuse spreadsheet formulas (strings starting with = + - @ tab CR). */
export const csvCell = (v: CsvCell): string => {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const csvRow = (cells: CsvCell[]): string => `${cells.map(csvCell).join(",")}\r\n`;

const pad = (n: number): string => String(n).padStart(2, "0");

/** "YYYY-MM-DD HH:mm:ss" in IST. */
export const istStamp = (ms: number): string => {
  const d = new Date(ms + IST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};
export const istDate = (ms: number): string => istStamp(ms).slice(0, 10);
export const istDayStart = (ms: number): number =>
  Math.floor((ms + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;

const utcStamp = (d: Date | null | undefined): string => (d ? d.toISOString() : "");
const istOf = (d: Date | null | undefined): string => (d ? istStamp(d.getTime()) : "");

/** Milliseconds one relay was ON per IST day (key = UTC ms of the IST day start). Pure, unit-tested. */
export function onMsPerDay(
  initialOn: boolean,
  changes: { at: number; state: boolean }[],
  fromMs: number,
  toMs: number,
  nowMs: number = Date.now(),
): Map<number, number> {
  const acc = new Map<number, number>();
  const add = (a: number, b: number): void => {
    for (let day = istDayStart(a); day < b; day += DAY_MS) {
      const ms = Math.min(b, day + DAY_MS) - Math.max(a, day);
      if (ms > 0) acc.set(day, (acc.get(day) ?? 0) + ms);
    }
  };
  let on = initialOn;
  let since = fromMs;
  for (const c of changes) {
    if (c.at < fromMs || c.at >= toMs || c.state === on) continue;
    if (on) add(since, c.at);
    on = c.state;
    since = c.at;
  }
  const end = Math.min(toMs, nowMs);
  if (on && end > since) add(since, end);
  return acc;
}

/** CSV reports as async generators of text chunks. The header is yielded after the device lookup. */
export default class ReportService {
  private static async devices(deviceId: string | undefined, types: DeviceType[]): Promise<Device[]> {
    const rows = await prisma.device.findMany({
      where: { deviceType: { in: types }, ...(deviceId && { deviceId }) },
      orderBy: { deviceId: "asc" },
    });
    if (deviceId && rows.length === 0) throw new AppError("Device not found", 404, "DEVICE_NOT_FOUND");
    return rows;
  }

  static async *relayOnTime(q: ReportRange, nowMs: number = Date.now()): AsyncGenerator<string> {
    const devices = await ReportService.devices(q.deviceId, RELAY_TYPES);
    const from = new Date(q.from);
    const to = new Date(q.to);
    yield csvRow(["device_id", "relay", "date_ist", "day_start_utc", "on_seconds", "on_hours"]);

    const days: number[] = [];
    for (let d = istDayStart(from.getTime()); d < to.getTime(); d += DAY_MS) days.push(d);

    for (const device of devices) {
      const byRelay = new Map<number, { at: number; state: boolean }[]>();
      let cursor: string | undefined;
      for (;;) {
        const rows = await prisma.relayStateChange.findMany({
          where: { deviceId: device.deviceId, at: { gte: from, lt: to } },
          orderBy: [{ at: "asc" }, { id: "asc" }],
          take: BATCH,
          ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        });
        for (const r of rows) {
          const list = byRelay.get(r.relay) ?? [];
          list.push({ at: r.at.getTime(), state: r.state });
          byRelay.set(r.relay, list);
        }
        if (rows.length < BATCH) break;
        cursor = rows[rows.length - 1]!.id;
      }

      const channels = DEVICE_TYPES[device.deviceType as DeviceType].channelCount ?? 0;
      for (let relay = 1; relay <= channels; relay++) {
        // State carried in from before the window: the last change of this relay earlier than `from`.
        const prior = await prisma.relayStateChange.findFirst({
          where: { deviceId: device.deviceId, relay, at: { lt: from } },
          orderBy: [{ at: "desc" }, { id: "desc" }],
        });
        const perDay = onMsPerDay(prior?.state === true, byRelay.get(relay) ?? [], from.getTime(), to.getTime(), nowMs);
        for (const day of days) {
          const sec = Math.round((perDay.get(day) ?? 0) / 1000);
          yield csvRow([
            device.deviceId,
            relay,
            istDate(day),
            new Date(day).toISOString(),
            sec,
            Math.round((sec / 3600) * 100) / 100,
          ]);
        }
      }
    }
  }

  static async *commands(q: ReportRange): AsyncGenerator<string> {
    if (q.deviceId) await ReportService.devices(q.deviceId, KNOWN_TYPES);
    yield csvRow([
      "issued_at_ist", "issued_at_utc", "device_id", "command_id", "action", "params", "source",
      "issued_by", "status", "reason", "completed_at_ist", "completed_at_utc",
    ]);
    let cursor: string | undefined;
    for (;;) {
      const rows = await prisma.command.findMany({
        where: {
          issuedAt: { gte: new Date(q.from), lt: new Date(q.to) },
          ...(q.deviceId && { deviceId: q.deviceId }),
        },
        orderBy: [{ issuedAt: "asc" }, { id: "asc" }],
        take: BATCH,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });
      for (const c of rows) {
        yield csvRow([
          istOf(c.issuedAt), utcStamp(c.issuedAt), c.deviceId, c.commandId, c.action,
          JSON.stringify(c.params ?? {}), c.source, c.issuedByEmail, c.status, c.reason,
          istOf(c.completedAt), utcStamp(c.completedAt),
        ]);
      }
      if (rows.length < BATCH) break;
      cursor = rows[rows.length - 1]!.id;
    }
  }

  /** ONLINE / OFFLINE / STALE transitions with seconds spent in each state (until the next event or the window end). */
  static async *availability(q: ReportRange, nowMs: number = Date.now()): AsyncGenerator<string> {
    const devices = await ReportService.devices(q.deviceId, KNOWN_TYPES);
    yield csvRow(["at_ist", "at_utc", "device_id", "event", "previous", "duration_seconds"]);
    const from = new Date(q.from);
    const to = new Date(q.to);
    const endMs = Math.min(to.getTime(), nowMs);
    for (const device of devices) {
      let cursor: string | undefined;
      let held: { at: Date; type: string; previous: string } | null = null;
      const emit = (next: Date | null): string | null => {
        if (!held) return null;
        const until = next ? next.getTime() : endMs;
        const secs = Math.max(0, Math.round((until - held.at.getTime()) / 1000));
        return csvRow([istOf(held.at), utcStamp(held.at), device.deviceId, held.type, held.previous, secs]);
      };
      for (;;) {
        const rows = await prisma.deviceEvent.findMany({
          where: {
            deviceId: device.deviceId,
            type: { in: ["ONLINE", "OFFLINE", "STALE"] },
            receivedAt: { gte: from, lt: to },
          },
          orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
          take: BATCH,
          ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        });
        for (const e of rows) {
          const line = emit(e.receivedAt);
          if (line) yield line;
          const data = (e.data ?? {}) as { previous?: unknown };
          held = { at: e.receivedAt, type: e.type, previous: typeof data.previous === "string" ? data.previous : "" };
        }
        if (rows.length < BATCH) break;
        cursor = rows[rows.length - 1]!.id;
      }
      const last = emit(null);
      if (last) yield last;
    }
  }
}
