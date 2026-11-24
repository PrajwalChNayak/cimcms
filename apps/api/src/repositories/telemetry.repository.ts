import prisma from "@models/prisma.client";

export interface TelemetryPoint {
  ts: Date;
  deviceId: string;
  type: string;
  mode?: string | null;
  simulationMode?: boolean | null;
  relayStates?: boolean[];
  relayOnCount?: number;
  rssiDbm?: number | null;
  wifiConnected?: boolean | null;
  mqttConnected?: boolean | null;
  rtcValid?: boolean | null;
  seq?: number | null;
  bootId?: string | null;
}

export interface TelemetryQuery {
  deviceId: string;
  from?: Date;
  to?: Date;
  /** Max rows returned. */
  limit?: number;
  order?: "asc" | "desc";
}

const MAX_LIMIT = 10_000;

type Row = {
  ts: Date;
  deviceId: string;
  type: string;
  mode: string | null;
  simulationMode: boolean | null;
  relayStates: boolean[];
  relayOnCount: number | null;
  rssiDbm: number | null;
  wifiConnected: boolean | null;
  mqttConnected: boolean | null;
  rtcValid: boolean | null;
  seq: number | null;
  bootId: string | null;
};

/** Drops null columns so callers see the same optional shape as before. */
function fromRow(row: Row): TelemetryPoint {
  const out: Record<string, unknown> = { ts: row.ts, deviceId: row.deviceId, type: row.type };
  for (const [k, v] of Object.entries(row)) {
    if (k === "ts" || k === "deviceId" || k === "type") continue;
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out as unknown as TelemetryPoint;
}

const SELECT = {
  ts: true,
  deviceId: true,
  type: true,
  mode: true,
  simulationMode: true,
  relayStates: true,
  relayOnCount: true,
  rssiDbm: true,
  wifiConnected: true,
  mqttConnected: true,
  rtcValid: true,
  seq: true,
  bootId: true,
} as const;

/** Telemetry history table (PostgreSQL). Old rows are removed by RetentionJob. */
class TelemetryRepository {
  static async insertMany(points: TelemetryPoint[]): Promise<number> {
    if (points.length === 0) return 0;
    const { count } = await prisma.telemetry.createMany({
      data: points.map((p) => ({
        ts: p.ts,
        deviceId: p.deviceId,
        type: p.type,
        mode: p.mode ?? null,
        simulationMode: p.simulationMode ?? null,
        relayStates: p.relayStates ?? [],
        relayOnCount: p.relayOnCount ?? null,
        rssiDbm: p.rssiDbm ?? null,
        wifiConnected: p.wifiConnected ?? null,
        mqttConnected: p.mqttConnected ?? null,
        rtcValid: p.rtcValid ?? null,
        seq: p.seq ?? null,
        bootId: p.bootId ?? null,
      })),
    });
    return count;
  }

  static async insert(point: TelemetryPoint): Promise<void> {
    await this.insertMany([point]);
  }

  static async find({ deviceId, from, to, limit = 100, order = "asc" }: TelemetryQuery): Promise<TelemetryPoint[]> {
    const take = Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
    const rows = await prisma.telemetry.findMany({
      where: {
        deviceId,
        ...((from || to) && { ts: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
      },
      orderBy: [{ ts: order }, { id: order }],
      take,
      select: SELECT,
    });
    return rows.map(fromRow);
  }

  /** Deletes rows older than `cutoff`. Returns the number removed. */
  static async deleteOlderThan(cutoff: Date): Promise<number> {
    const { count } = await prisma.telemetry.deleteMany({ where: { ts: { lt: cutoff } } });
    return count;
  }
}

export default TelemetryRepository;
