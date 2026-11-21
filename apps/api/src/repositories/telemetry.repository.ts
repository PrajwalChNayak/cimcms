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
  /** Max documents returned; also used as batchSize (Mongo default batch is 101). */
  limit?: number;
  order?: "asc" | "desc";
}

type ExtDate = { $date: string | { $numberLong: string } };
type RawDoc = Record<string, unknown> & { ts: ExtDate | string; meta: { deviceId: string; type: string } };

const MAX_LIMIT = 10_000;

const extDate = (d: Date): ExtDate => ({ $date: d.toISOString() });

function parseDate(v: ExtDate | string): Date {
  if (typeof v === "string") return new Date(v);
  const inner = v.$date;
  return typeof inner === "string" ? new Date(inner) : new Date(Number(inner.$numberLong));
}

function toDocument(p: TelemetryPoint): Record<string, unknown> {
  const { ts, deviceId, type, ...rest } = p;
  const doc: Record<string, unknown> = { ts: extDate(ts), meta: { deviceId, type } };
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined && v !== null) doc[k] = v;
  }
  return doc;
}

function fromDocument(raw: RawDoc): TelemetryPoint {
  const { _id: _ignored, ts, meta, ...rest } = raw;
  return { ...(rest as object), ts: parseDate(ts), deviceId: meta.deviceId, type: meta.type } as TelemetryPoint;
}

/**
 * Time-series `telemetry` collection (created by initTimeseries). Not a Prisma
 * model, so it does not extend BaseRepository and goes through $runCommandRaw.
 */
class TelemetryRepository {
  static async insertMany(points: TelemetryPoint[]): Promise<number> {
    if (points.length === 0) return 0;
    const res = (await prisma.$runCommandRaw({
      insert: "telemetry",
      documents: points.map(toDocument) as never,
      ordered: false,
    })) as { n?: number; writeErrors?: unknown[] };
    if (res.writeErrors?.length) {
      throw new Error(`Telemetry insert had ${res.writeErrors.length} write error(s)`);
    }
    return res.n ?? points.length;
  }

  static async insert(point: TelemetryPoint): Promise<void> {
    await this.insertMany([point]);
  }

  static async find({ deviceId, from, to, limit = 100, order = "asc" }: TelemetryQuery): Promise<TelemetryPoint[]> {
    const take = Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
    const ts: Record<string, ExtDate> = {};
    if (from) ts.$gte = extDate(from);
    if (to) ts.$lte = extDate(to);
    const filter: Record<string, unknown> = { "meta.deviceId": deviceId };
    if (from || to) filter.ts = ts;

    const res = (await prisma.$runCommandRaw({
      find: "telemetry",
      filter: filter as never,
      sort: { ts: order === "asc" ? 1 : -1 },
      limit: take,
      batchSize: take,
    })) as { cursor?: { firstBatch?: RawDoc[] } };

    return (res.cursor?.firstBatch ?? []).map(fromDocument);
  }
}

export default TelemetryRepository;
