import { afterAll, describe, expect, it } from "vitest";
import prisma from "@models/prisma.client";
import { initTimeseries } from "@models/init/timeseries";
import TelemetryRepository from "@repositories/telemetry.repository";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("telemetry time-series", () => {
  it("initTimeseries can be called twice", async () => {
    await initTimeseries();
    await expect(initTimeseries()).resolves.toBeUndefined();
  });

  it("inserts and reads back 3 points in time order", async () => {
    await initTimeseries();
    const base = Date.UTC(2026, 10, 20, 12, 0, 0);
    // inserted out of order on purpose
    const times = [2, 0, 1].map((m) => new Date(base + m * 60_000));
    await TelemetryRepository.insertMany(
      times.map((ts, i) => ({
        ts,
        deviceId: "LED-TS-1",
        type: "LED_CONTROLLER",
        mode: "MANUAL",
        simulationMode: true,
        relayStates: Array<boolean>(16).fill(i === 0),
        relayOnCount: i === 0 ? 16 : 0,
        rssiDbm: -60,
        seq: i,
        bootId: "boot-1",
      })),
    );
    await TelemetryRepository.insert({ ts: new Date(base), deviceId: "LED-OTHER", type: "LED_CONTROLLER" });

    const asc = await TelemetryRepository.find({ deviceId: "LED-TS-1", limit: 3 });
    expect(asc.map((p) => p.ts.getTime())).toEqual([base, base + 60_000, base + 120_000]);
    expect(asc[0]?.deviceId).toBe("LED-TS-1");
    expect(asc[0]?.relayStates).toHaveLength(16);

    const desc = await TelemetryRepository.find({ deviceId: "LED-TS-1", order: "desc", limit: 2 });
    expect(desc.map((p) => p.ts.getTime())).toEqual([base + 120_000, base + 60_000]);

    const ranged = await TelemetryRepository.find({
      deviceId: "LED-TS-1",
      from: new Date(base + 30_000),
      to: new Date(base + 90_000),
    });
    expect(ranged).toHaveLength(1);
  });

  it("returns more than 101 rows when limit is larger (batchSize = limit)", async () => {
    const base = Date.UTC(2026, 10, 21, 0, 0, 0);
    await TelemetryRepository.insertMany(
      Array.from({ length: 150 }, (_, i) => ({
        ts: new Date(base + i * 1000),
        deviceId: "LED-BIG",
        type: "LED_CONTROLLER",
      })),
    );
    const rows = await TelemetryRepository.find({ deviceId: "LED-BIG", limit: 150 });
    expect(rows).toHaveLength(150);
  });
});
