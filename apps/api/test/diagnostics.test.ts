import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "@/createApp";
import prisma from "@models/prisma.client";
import { LED, startRig, type Rig } from "./rig";
import { mintToken } from "./helpers/tokens";
import { waitFor } from "./helpers/wait";

const API = `/${process.env.MAIN_ROUTE}`;

let rig: Rig;
let app: ReturnType<typeof createApp>;
let ledOid: string;

const tokens = {
  viewer: mintToken("VIEWER"),
  technician: mintToken("TECHNICIAN"),
  operator: mintToken("OPERATOR"),
  admin: mintToken("ADMIN"),
};

const rtcSync = (role: keyof typeof tokens | null, id?: string) => {
  let req = request(app).post(`${API}/devices/${id ?? ledOid}/rtc-sync`);
  if (role) req = req.set("Authorization", `Bearer ${tokens[role].token}`);
  return req.send({});
};

const command = (commandId: string) => prisma.command.findUnique({ where: { commandId } });

async function onlineDevice(opts: Parameters<Rig["sim"]>[0] = {}) {
  const sim = await rig.sim(opts);
  await waitFor(async () => (await rig.status())?.relayStates.length === 16, 5000, "device online");
  return sim;
}

beforeAll(async () => {
  rig = await startRig([LED]);
  app = createApp();
  ledOid = (await prisma.device.findUniqueOrThrow({ where: { deviceId: LED.deviceId } })).id;
});
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entity: "Command" } });
  await rig.stop();
});
beforeEach(async () => {
  await rig.settle();
  await rig.reset();
});

describe("POST /devices/:id/rtc-sync", () => {
  it("needs DEVICE_DIAGNOSTICS: OPERATOR and VIEWER are refused, no command is created", async () => {
    await onlineDevice();
    expect((await rtcSync(null)).status).toBe(401);
    for (const role of ["viewer", "operator"] as const) {
      const res = await rtcSync(role);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe("FORBIDDEN");
    }
    expect(await prisma.command.count({ where: { deviceId: LED.deviceId } })).toBe(0);
  });

  it("TECHNICIAN and ADMIN: 202, ACCEPTED then EXECUTED, RTC_SYNC event, snapshot shows the sync, audit row", async () => {
    await onlineDevice({ latencyMs: 0 });
    for (const role of ["technician", "admin"] as const) {
      const res = await rtcSync(role);
      expect(res.status).toBe(202);
      expect(res.body.result).toMatchObject({ action: "RTC_SYNC_NOW", params: {}, source: "web" });
      const id = res.body.result.commandId as string;
      const row = await waitFor(
        async () => {
          const r = await command(id);
          return r?.status === "EXECUTED" ? r : null;
        },
        3000,
        "executed",
      );
      expect(row.acks.map((a) => a.result)).toEqual(["ACCEPTED", "EXECUTED"]);
    }
    await waitFor(
      async () => (await prisma.deviceEvent.findFirst({ where: { deviceId: LED.deviceId, type: "RTC_SYNC" } })) !== null,
      3000,
      "rtc event",
    );
    const status = await waitFor(
      async () => {
        const s = await prisma.deviceStatus.findUnique({ where: { deviceId: LED.deviceId } });
        return (s?.rtc as { lastSyncResult?: string } | null)?.lastSyncResult === "OK" ? s : null;
      },
      3000,
      "snapshot rtc",
    );
    expect(status.rtc).toMatchObject({ valid: true, syncSource: "NTP-SIM", lastSyncResult: "OK", driftMs: 0 });
    expect(await prisma.auditLog.count({ where: { entity: "Command", action: "COMMAND_SUBMITTED", actorId: tokens.admin.userId } })).toBe(1);
  });

  it("a failing sync ends FAILED and the last sync result is FAILED", async () => {
    await onlineDevice({ latencyMs: 0, rtcSyncFails: true });
    const res = await rtcSync("technician");
    expect(res.status).toBe(202);
    const id = res.body.result.commandId as string;
    const row = await waitFor(
      async () => {
        const r = await command(id);
        return r?.status === "FAILED" ? r : null;
      },
      3000,
      "failed",
    );
    expect(row.reason).toBe("RTC_SYNC_FAILED");
    await waitFor(
      async () =>
        ((await prisma.deviceStatus.findUnique({ where: { deviceId: LED.deviceId } }))?.rtc as { lastSyncResult?: string } | null)
          ?.lastSyncResult === "FAILED",
      3000,
      "snapshot failed",
    );
  });

  it("works in every mode (AUTO included) but not for an offline device or an unknown one", async () => {
    const sim = await onlineDevice({ latencyMs: 0 });
    await sim.setMode("AUTO");
    await waitFor(async () => (await prisma.deviceStatus.findUnique({ where: { deviceId: LED.deviceId } }))?.mode === "AUTO", 3000, "auto");
    expect((await rtcSync("admin")).status).toBe(202);

    await rig.settle();
    const offline = await rtcSync("admin");
    expect(offline.status).toBe(409);
    expect(offline.body.errorCode).toBe("DEVICE_OFFLINE");

    const unknown = await rtcSync("admin", "a".repeat(24));
    expect(unknown.status).toBe(404);
    expect((await rtcSync("admin", "not-an-id")).status).toBe(400);
  });
});

describe("GET /system/status", () => {
  it("is admin only (DEVICE_MANAGE) and reports mongo and mqtt", async () => {
    const get = (role: keyof typeof tokens | null) => {
      const req = request(app).get(`${API}/system/status`);
      return role ? req.set("Authorization", `Bearer ${tokens[role].token}`) : req;
    };
    expect((await get(null)).status).toBe(401);
    for (const role of ["viewer", "technician", "operator"] as const) {
      expect((await get(role)).status).toBe(403);
    }
    const res = await get("admin");
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ status: "ok", mongo: "up", mqtt: "up" });
  });
});
