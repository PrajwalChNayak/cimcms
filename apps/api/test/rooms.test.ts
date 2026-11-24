import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "@models/prisma.client";
import { getTestApp } from "./helpers/app";
import { mintToken } from "./helpers/tokens";

const API = `/${process.env.MAIN_ROUTE}`;
const app = getTestApp();
const admin = mintToken("ADMIN");
const operator = mintToken("OPERATOR");
const viewer = mintToken("VIEWER");

const LED = "LED-RM1";
const HUM = "HUM-RM1";

const call = (method: "get" | "post" | "put", path: string, token: string | null, body?: object) => {
  let req = request(app)[method](`${API}${path}`);
  if (token) req = req.set("Authorization", `Bearer ${token}`);
  return body ? req.send(body) : req;
};

let roomA: string;
let roomB: string;

beforeAll(async () => {
  await prisma.device.createMany({
    data: [
      { deviceId: LED, deviceType: "LED_CONTROLLER" },
      { deviceId: HUM, deviceType: "HUMIDIFIER" },
    ],
  });
  // TODO(owner-decision O-9): no real rooms are seeded; tests use fixture names.
  const a = await call("post", "/rooms", admin.token, { code: "TRA", name: "Test Room A" });
  const b = await call("post", "/rooms", admin.token, { code: "TRB", name: "Test Room B" });
  roomA = a.body.result.id;
  roomB = b.body.result.id;
});

afterAll(async () => {
  await prisma.roomChannelAssignment.deleteMany({});
  await prisma.room.deleteMany({});
  await prisma.device.deleteMany({ where: { deviceId: { in: [LED, HUM] } } });
  await prisma.auditLog.deleteMany({ where: { entity: "Room" } });
});

describe("rooms", () => {
  it("requires authentication and ROOM_READ / ROOM_WRITE", async () => {
    expect((await call("get", "/rooms", null)).status).toBe(401);
    expect((await call("get", "/rooms", viewer.token)).status).toBe(200);
    const denied = await call("post", "/rooms", operator.token, { code: "X1", name: "Nope" });
    expect(denied.status).toBe(403);
    expect(denied.body.errorCode).toBe("FORBIDDEN");
    expect((await call("put", `/rooms/${roomA}`, viewer.token, { name: "x" })).status).toBe(403);
    expect((await call("put", `/rooms/${roomA}/channels`, operator.token, { channels: [] })).status).toBe(403);
  });

  it("creates, lists, fetches and updates a room, with audit rows", async () => {
    const created = await call("post", "/rooms", admin.token, { code: "TRC", name: "Test Room C", notes: "n" });
    expect(created.status).toBe(201);
    expect(created.body.result).toMatchObject({ code: "TRC", name: "Test Room C", status: "ACTIVE", notes: "n", channelCount: 0 });
    const id = created.body.result.id as string;

    const list = await call("get", "/rooms?q=room c", viewer.token);
    expect(list.body.result.data.map((r: { code: string }) => r.code)).toEqual(["TRC"]);

    const upd = await call("put", `/rooms/${id}`, admin.token, { name: "Renamed", status: "INACTIVE" });
    expect(upd.status).toBe(200);
    expect(upd.body.result).toMatchObject({ name: "Renamed", status: "INACTIVE", code: "TRC" });
    expect((await call("get", `/rooms/${id}`, viewer.token)).body.result.name).toBe("Renamed");
    expect((await call("get", "/rooms?status=INACTIVE", viewer.token)).body.result.data).toHaveLength(1);

    const audits = await prisma.auditLog.findMany({ where: { entity: "Room", entityId: id } });
    expect(audits.map((a) => a.action).sort()).toEqual(["ROOM_CREATED", "ROOM_UPDATED"]);
    expect(audits[0]?.actorEmail).toBe(admin.email);
  });

  it("rejects a duplicate room code and bad input", async () => {
    const dup = await call("post", "/rooms", admin.token, { code: "TRA", name: "again" });
    expect(dup.status).toBe(409);
    expect(dup.body.errorCode).toBe("ROOM_CODE_TAKEN");
    expect((await call("post", "/rooms", admin.token, { code: "bad code!", name: "x" })).status).toBe(400);
    expect((await call("put", `/rooms/${roomA}`, admin.token, {})).status).toBe(400);
    const missing = await call("get", "/rooms/00000000-0000-4000-8000-000000000000", viewer.token);
    expect(missing.status).toBe(404);
    expect(missing.body.errorCode).toBe("ROOM_NOT_FOUND");
  });
});

describe("room channels", () => {
  it("replaces the full channel set and audits it", async () => {
    const res = await call("put", `/rooms/${roomA}/channels`, admin.token, {
      channels: [
        { deviceId: LED, relay: 1, label: "Shelf 1" },
        { deviceId: LED, relay: 2 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual([
      { deviceId: LED, relay: 1, label: "Shelf 1" },
      { deviceId: LED, relay: 2, label: null },
    ]);

    // Replace: relay 2 removed, relay 3 added.
    await call("put", `/rooms/${roomA}/channels`, admin.token, {
      channels: [
        { deviceId: LED, relay: 1, label: "Shelf 1" },
        { deviceId: LED, relay: 3 },
      ],
    });
    const got = await call("get", `/rooms/${roomA}/channels`, viewer.token);
    expect(got.body.result.map((c: { relay: number }) => c.relay)).toEqual([1, 3]);
    expect((await call("get", `/rooms/${roomA}`, viewer.token)).body.result.channelCount).toBe(2);

    const audit = await prisma.auditLog.findFirst({
      where: { entity: "Room", entityId: roomA, action: "ROOM_CHANNELS_REPLACED" },
      orderBy: { at: "desc" },
    });
    expect(audit).not.toBeNull();
  });

  it("refuses a relay that belongs to another room (409 naming the room)", async () => {
    const res = await call("put", `/rooms/${roomB}/channels`, admin.token, {
      channels: [{ deviceId: LED, relay: 3 }],
    });
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe("RELAY_ALREADY_ASSIGNED");
    expect(res.body.message).toContain("Test Room A");
    expect(res.body.details[0]).toMatchObject({ deviceId: LED, relay: 3, roomCode: "TRA" });
    // Room B stays untouched.
    expect((await call("get", `/rooms/${roomB}/channels`, viewer.token)).body.result).toEqual([]);
  });

  it("validates relay range, duplicates, unknown device and devices without channels", async () => {
    const put = (channels: object[]) => call("put", `/rooms/${roomB}/channels`, admin.token, { channels });
    expect((await put([{ deviceId: LED, relay: 17 }])).status).toBe(400);
    const dup = await put([{ deviceId: LED, relay: 5 }, { deviceId: LED, relay: 5 }]);
    expect(dup.status).toBe(400);
    expect(dup.body.errorCode).toBe("VALIDATION_FAILED");
    const unknown = await put([{ deviceId: "LED-NOPE", relay: 1 }]);
    expect(unknown.status).toBe(404);
    expect(unknown.body.errorCode).toBe("DEVICE_NOT_FOUND");
    const noChannels = await put([{ deviceId: HUM, relay: 1 }]);
    expect(noChannels.status).toBe(400);
  });

  it("room-channels view lists assignments with room names, filtered by device", async () => {
    const res = await call("get", `/room-channels?deviceId=${LED}`, viewer.token);
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual([
      { deviceId: LED, relay: 1, label: "Shelf 1", roomId: roomA, roomCode: "TRA", roomName: "Test Room A" },
      { deviceId: LED, relay: 3, label: null, roomId: roomA, roomCode: "TRA", roomName: "Test Room A" },
    ]);
  });

  it("the unique index also blocks a direct double assignment", async () => {
    await expect(
      prisma.roomChannelAssignment.create({ data: { roomId: roomB, deviceId: LED, relay: 1 } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
