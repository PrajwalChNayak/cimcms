import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "@models/prisma.client";
import { csvCell, csvRow, istDayStart, istStamp, onMsPerDay } from "@services/report.service";
import { getTestApp } from "./helpers/app";
import { mintToken } from "./helpers/tokens";
import { waitFor } from "./helpers/wait";

const API = `/${process.env.MAIN_ROUTE}`;
const app = getTestApp();
const viewer = mintToken("VIEWER");
const nobody = mintToken("VIEWER", { permissions: [] });
const deviceReadOnly = mintToken("VIEWER", { permissions: ["DEVICE_READ"] });

const DEV = "LED-RPT1";
const FROM = "2026-09-30T18:30:00.000Z"; // 2026-10-01 00:00 IST
const TO = "2026-10-04T18:30:00.000Z"; // 4 IST days later
const q = (extra = "", from = FROM, to = TO) => `from=${from}&to=${to}${extra}`;

const get = (path: string, token: string | null = viewer.token) => {
  const req = request(app).get(`${API}${path}`);
  return token ? req.set("Authorization", `Bearer ${token}`) : req;
};

const lines = (text: string): string[] => text.trim().split("\r\n");

beforeAll(async () => {
  await prisma.device.deleteMany({ where: { deviceId: DEV } });
  await prisma.device.create({ data: { deviceId: DEV, deviceType: "LED_CONTROLLER", name: "Report LED" } });

  const ch = (relay: number, state: boolean, at: string) => ({
    deviceId: DEV, relay, state, source: "COMMAND", simulation: true, at: new Date(at),
  });
  await prisma.relayStateChange.deleteMany({ where: { deviceId: DEV } });
  await prisma.relayStateChange.createMany({
    data: [
      ch(1, true, "2026-09-30T10:00:00.000Z"), // carried in: ON before the window
      ch(1, false, "2026-10-01T00:30:00.000Z"),
      ch(2, true, "2026-10-01T17:00:00.000Z"),
      ch(2, false, "2026-10-02T01:00:00.000Z"), // spans an IST midnight
      ch(3, true, "2026-10-04T00:00:00.000Z"), // still ON at the end of the window
    ],
  });

  await prisma.command.deleteMany({ where: { deviceId: DEV } });
  await prisma.command.createMany({
    data: [
      {
        commandId: "rpt-cmd-1", idempotencyKey: "rpt-cmd-1", deviceId: DEV, action: "SET_RELAY",
        params: { relay: 2, state: "ON" }, source: "web", issuedByEmail: "+evil@test.local",
        status: "REJECTED", reason: '=HYPERLINK("x"),\nsecond line',
        issuedAt: new Date("2026-10-01T05:00:00.000Z"), expiresAt: new Date("2026-10-01T05:00:15.000Z"),
      },
      {
        commandId: "rpt-cmd-2", idempotencyKey: "rpt-cmd-2", deviceId: DEV, action: "SET_ALL_RELAYS",
        params: { state: "OFF" }, source: "web", issuedByEmail: "op@test.local", status: "EXECUTED",
        issuedAt: new Date("2026-10-02T05:00:00.000Z"), expiresAt: new Date("2026-10-02T05:00:15.000Z"),
        completedAt: new Date("2026-10-02T05:00:01.000Z"),
      },
      {
        // outside the window
        commandId: "rpt-cmd-3", idempotencyKey: "rpt-cmd-3", deviceId: DEV, action: "SET_RELAY",
        params: { relay: 1, state: "ON" }, source: "web", status: "EXECUTED",
        issuedAt: new Date("2026-11-01T05:00:00.000Z"), expiresAt: new Date("2026-11-01T05:00:15.000Z"),
      },
    ],
  });

  await prisma.deviceEvent.deleteMany({ where: { deviceId: DEV } });
  await prisma.deviceEvent.createMany({
    data: [
      { deviceId: DEV, type: "ONLINE", origin: "BACKEND", data: {}, receivedAt: new Date("2026-10-01T06:00:00.000Z") },
      { deviceId: DEV, type: "STALE", origin: "BACKEND", data: { previous: "ONLINE" }, receivedAt: new Date("2026-10-01T07:00:00.000Z") },
      { deviceId: DEV, type: "OFFLINE", origin: "BACKEND", data: { previous: "STALE" }, receivedAt: new Date("2026-10-01T07:10:00.000Z") },
      { deviceId: DEV, type: "BOOT", origin: "DEVICE", data: {}, receivedAt: new Date("2026-10-01T08:00:00.000Z") },
    ],
  });
});

afterAll(async () => {
  await prisma.device.deleteMany({ where: { deviceId: DEV } });
  await prisma.relayStateChange.deleteMany({ where: { deviceId: DEV } });
  await prisma.command.deleteMany({ where: { deviceId: DEV } });
  await prisma.deviceEvent.deleteMany({ where: { deviceId: DEV } });
  await prisma.auditLog.deleteMany({ where: { action: "REPORT_EXPORTED", entityId: { in: ["relay-on-time", "commands", "availability"] } } });
  await prisma.$disconnect();
});

describe("csv helpers", () => {
  it("quotes and defuses formulas", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    for (const bad of ["=1+1", "+1", "-1", "@SUM(A1)"]) expect(csvCell(bad)).toBe(`'${bad}`);
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(null)).toBe("");
    expect(csvRow(["a", 1, true])).toBe("a,1,true\r\n");
  });

  it("formats IST", () => {
    expect(istStamp(Date.parse(FROM))).toBe("2026-10-01 00:00:00");
    expect(istDayStart(Date.parse("2026-10-01T17:00:00.000Z"))).toBe(Date.parse(FROM));
  });

  it("on-time: carried-in state, midnight split, open end capped at now", () => {
    const from = Date.parse(FROM);
    const day = 24 * 3600_000;
    const r = onMsPerDay(true, [{ at: from + 3600_000, state: false }], from, from + 2 * day);
    expect(r.get(from)).toBe(3600_000);
    const open = onMsPerDay(false, [{ at: from + day - 1000, state: true }], from, from + 2 * day, from + day + 1000);
    expect(open.get(from)).toBe(1000);
    expect(open.get(from + day)).toBe(1000);
  });
});

describe("permission and validation", () => {
  const paths = ["/reports/relay-on-time.csv", "/reports/commands.csv", "/reports/availability.csv"];

  it.each(paths)("%s: 401 without a token", async (p) => {
    expect((await get(`${p}?${q()}`, null)).status).toBe(401);
  });

  it.each(paths)("%s: 403 without REPORT_EXPORT", async (p) => {
    const res = await get(`${p}?${q()}`, deviceReadOnly.token);
    expect(res.status).toBe(403);
    expect((await get(`${p}?${q()}`, nobody.token)).body.errorCode).toBe("FORBIDDEN");
  });

  it.each(paths)("%s: 400 for a range over 31 days, reversed, or missing", async (p) => {
    const long = await get(`${p}?${q("", FROM, "2026-11-05T18:30:00.000Z")}`);
    expect(long.status).toBe(400);
    expect(long.body.errorCode).toBe("VALIDATION_FAILED");
    expect((await get(`${p}?${q("", TO, FROM)}`)).status).toBe(400);
    expect((await get(`${p}?from=${FROM}`)).status).toBe(400);
    expect((await get(`${p}?${q("", "2026-10-01", TO)}`)).status).toBe(400);
  });

  it("accepts exactly 31 days", async () => {
    const res = await get(`/reports/commands.csv?${q(`&deviceId=${DEV}`, FROM, "2026-10-31T18:30:00.000Z")}`);
    expect(res.status).toBe(200);
  });

  it("404 for an unknown device", async () => {
    const res = await get(`/reports/availability.csv?${q("&deviceId=NOPE-1")}`);
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe("DEVICE_NOT_FOUND");
  });
});

describe("relay-on-time.csv", () => {
  it("per relay per IST day, with carried-in and open-ended state", async () => {
    const res = await get(`/reports/relay-on-time.csv?${q(`&deviceId=${DEV}`)}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="relay-on-time_2026-10-01_2026-10-05.csv"',
    );
    const rows = lines(res.text);
    expect(rows[0]).toBe("device_id,relay,date_ist,day_start_utc,on_seconds,on_hours");
    expect(rows).toHaveLength(1 + 16 * 4);
    const find = (relay: number, date: string) =>
      rows.find((r) => r.startsWith(`${DEV},${relay},${date},`))?.split(",");
    expect(find(1, "2026-10-01")?.[3]).toBe("2026-09-30T18:30:00.000Z");
    expect(find(1, "2026-10-01")?.[4]).toBe("21600");
    expect(find(1, "2026-10-02")?.[4]).toBe("0");
    expect(find(2, "2026-10-01")?.[4]).toBe("5400");
    expect(find(2, "2026-10-02")?.[4]).toBe("23400");
    expect(find(3, "2026-10-04")?.[4]).toBe("66600");
    expect(find(3, "2026-10-03")?.[4]).toBe("0");
    expect(find(16, "2026-10-01")?.[4]).toBe("0");
  });

  it("records the export in the audit log", async () => {
    const auditor = mintToken("VIEWER");
    await get(`/reports/relay-on-time.csv?${q(`&deviceId=${DEV}`)}`, auditor.token);
    const row = await waitFor(
      () => prisma.auditLog.findFirst({ where: { action: "REPORT_EXPORTED", actorId: auditor.userId } }),
      3000,
      "audit row",
    );
    expect(row.entity).toBe("Report");
    expect(row.data).toMatchObject({ report: "relay-on-time", from: FROM, to: TO, deviceId: DEV });
  });
});

describe("commands.csv", () => {
  it("lists commands in the window with IST and UTC columns and escaped cells", async () => {
    const res = await get(`/reports/commands.csv?${q(`&deviceId=${DEV}`)}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("attachment;");
    expect(res.text).toContain(
      "issued_at_ist,issued_at_utc,device_id,command_id,action,params,source,issued_by,status,reason,completed_at_ist,completed_at_utc",
    );
    expect(res.text).not.toContain("rpt-cmd-3");
    // 05:00 UTC = 10:30 IST; JSON params are quoted; "+evil" and "=HYPERLINK" are defused.
    expect(res.text).toContain(
      '2026-10-01 10:30:00,2026-10-01T05:00:00.000Z,LED-RPT1,rpt-cmd-1,SET_RELAY,"{""relay"":2,""state"":""ON""}",web,\'+evil@test.local,REJECTED,"\'=HYPERLINK(""x""),\nsecond line",,',
    );
    expect(res.text).toContain("2026-10-02 10:30:01,2026-10-02T05:00:01.000Z");
  });
});

describe("availability.csv", () => {
  it("lists ONLINE/OFFLINE/STALE events with durations", async () => {
    const res = await get(`/reports/availability.csv?${q(`&deviceId=${DEV}`)}`);
    expect(res.status).toBe(200);
    const rows = lines(res.text);
    expect(rows[0]).toBe("at_ist,at_utc,device_id,event,previous,duration_seconds");
    expect(rows).toHaveLength(4); // BOOT is not an availability event
    expect(rows[1]).toBe("2026-10-01 11:30:00,2026-10-01T06:00:00.000Z,LED-RPT1,ONLINE,,3600");
    expect(rows[2]).toBe("2026-10-01 12:30:00,2026-10-01T07:00:00.000Z,LED-RPT1,STALE,ONLINE,600");
    // last event runs to the window end (TO is in the past)
    expect(rows[3].startsWith("2026-10-01 12:40:00,2026-10-01T07:10:00.000Z,LED-RPT1,OFFLINE,STALE,")).toBe(true);
    const lastSecs = (Date.parse(TO) - Date.parse("2026-10-01T07:10:00.000Z")) / 1000;
    expect(rows[3].endsWith(`,${lastSecs}`)).toBe(true);
  });
});
