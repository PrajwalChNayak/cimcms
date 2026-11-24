import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import {
  auditLogDtoSchema,
  commandDtoSchema,
  deviceListItemDtoSchema,
  SOCKET_NAMESPACE,
  SOCKET_PATH,
  type ClientToServerEvents,
  type CommandDto,
  type DeviceStateDto,
  type ServerToClientEvents,
  type SocketEnvelope,
  type SubscribeAck,
} from "@cimcms/contracts";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "@/createApp";
import { CommandTimeoutJob } from "@/jobs/commandTimeout.job";
import { attachRealtime, closeRealtime } from "@/realtime";
import { seedAdmin } from "@models/seed/admin";
import { seedRbac } from "@models/seed/rbac";
import prisma from "@models/prisma.client";
import { resetDatabase } from "@test/helpers/auth";
import { waitFor } from "@test/helpers/wait";
import { LED, startRig, type Rig } from "@test/rig";

const API = `/${process.env.MAIN_ROUTE}`;
const ADMIN_EMAIL = "e2e-admin@test.local";
const ADMIN_PASSWORD = `E2e-${randomUUID()}`; // throw-away test value

const paged = <T extends z.ZodType>(item: T) =>
  z.object({ result: z.object({ data: z.array(item), pagination: z.object({ total: z.number() }) }) });

const relayChangeSchema = z.object({
  relay: z.number(),
  state: z.boolean(),
  source: z.string(),
  commandId: z.string().nullable(),
  simulation: z.boolean(),
});

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let rig: Rig;
let app: ReturnType<typeof createApp>;
let httpServer: http.Server;
let socket: Client | undefined;
let token: string;
const commandUpdates: CommandDto[] = [];
const statuses: DeviceStateDto[] = [];

beforeAll(async () => {
  rig = await startRig([LED]);
  app = createApp();

  // Real RBAC seed + real admin user, then the real login endpoint.
  await seedRbac(prisma);
  await seedAdmin(prisma, ADMIN_EMAIL, ADMIN_PASSWORD);

  httpServer = http.createServer();
  attachRealtime(httpServer);
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
});

afterAll(async () => {
  CommandTimeoutJob.stop();
  socket?.disconnect();
  await closeRealtime();
  await prisma.auditLog.deleteMany({ where: { entity: "Command" } });
  await rig.stop();
  await prisma.rolePermission.deleteMany();
  await resetDatabase();
  await prisma.permission.deleteMany();
});

describe("LED controller end-to-end (aedes broker, embedded Postgres, API, simulator)", () => {
  const auth = (req: request.Test): request.Test => req.set("Authorization", `Bearer ${token}`);
  let ledId: string;
  let commandId: string;

  it("admin logs in with the real endpoint", async () => {
    const res = await request(app).post(`${API}/user/login`).send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    token = res.body.result.accessToken as string;
    expect(res.body.result.user.permissions).toEqual(
      expect.arrayContaining(["DEVICE_READ", "DEVICE_COMMAND", "DEVICE_COMMAND_BULK", "AUDIT_READ"]),
    );
  });

  it("GET /devices lists LED-01 with its live state once the simulator is online", async () => {
    // latency > 0 so the PUBLISHED update is emitted before the device acks
    await rig.sim({ latencyMs: 250 });
    await waitFor(async () => (await rig.status())?.relayStates.length === 16, 5000, "simulator online");

    const res = await auth(request(app).get(`${API}/devices?type=LED_CONTROLLER&limit=100`));
    expect(res.status).toBe(200);
    const led = paged(deviceListItemDtoSchema).parse(res.body).result.data.find((d) => d.deviceId === LED.deviceId);
    expect(led).toBeDefined();
    expect(led?.state).toMatchObject({ liveness: "ONLINE", simulationMode: true, mode: "MANUAL" });
    ledId = led?.id as string;
  });

  it("socket subscribes and receives the current device:status snapshot", async () => {
    const port = (httpServer.address() as AddressInfo).port;
    const s: Client = connect(`http://127.0.0.1:${port}${SOCKET_NAMESPACE}`, {
      path: SOCKET_PATH,
      transports: ["websocket"],
      reconnection: false,
      auth: { token },
    });
    socket = s;
    s.on("command:updated", (e: SocketEnvelope<CommandDto>) => commandUpdates.push(e.data));
    s.on("device:status", (e: SocketEnvelope<DeviceStateDto>) => statuses.push(e.data));
    await new Promise<void>((resolve, reject) => {
      s.once("connect", () => resolve());
      s.once("connect_error", reject);
    });
    const ack = await new Promise<SubscribeAck>((resolve) =>
      (s as unknown as Socket).emit("subscribe:device", { deviceId: LED.deviceId }, (r: SubscribeAck) => resolve(r)),
    );
    expect(ack).toEqual({ ok: true });
    await waitFor(() => statuses.length > 0, 2000, "initial snapshot");
    expect(statuses[0]?.relayStates[1]).toBe(false);
    statuses.length = 0;
  });

  it("POST SET_RELAY 2 ON: PUBLISHED then EXECUTED on the socket, then relay 2 true in device:status", async () => {
    const res = await auth(request(app).post(`${API}/devices/${ledId}/commands`)).send({
      action: "SET_RELAY",
      relay: 2,
      state: "ON",
    });
    expect(res.status).toBe(202);
    commandId = res.body.result.commandId as string;

    await waitFor(
      () => commandUpdates.some((u) => u.commandId === commandId && u.status === "EXECUTED"),
      5000,
      "EXECUTED update",
    );
    const seq = commandUpdates.filter((u) => u.commandId === commandId).map((u) => u.status);
    expect(seq).toContain("PUBLISHED");
    expect(seq.indexOf("PUBLISHED")).toBeLessThan(seq.indexOf("EXECUTED"));
    expect(commandDtoSchema.parse(commandUpdates.at(-1))).toMatchObject({ status: "EXECUTED", simulation: true });

    const withRelay = await waitFor(
      () => statuses.find((s) => s.relayStates[1] === true),
      5000,
      "device:status with relay 2 on",
    );
    expect(withRelay).toMatchObject({ deviceId: LED.deviceId, simulationMode: true, relayOnCount: 1 });
  });

  it("GET /devices/:id/commands shows the command with the issuer email", async () => {
    const res = await auth(request(app).get(`${API}/devices/${ledId}/commands`));
    expect(res.status).toBe(200);
    const cmd = paged(commandDtoSchema).parse(res.body).result.data.find((c) => c.commandId === commandId);
    expect(cmd).toMatchObject({
      action: "SET_RELAY",
      params: { relay: 2, state: "ON" },
      status: "EXECUTED",
      issuedBy: { email: ADMIN_EMAIL },
    });
  });

  it("GET /audit shows COMMAND_SUBMITTED", async () => {
    const res = await auth(request(app).get(`${API}/audit?action=COMMAND_SUBMITTED&entity=Command`));
    expect(res.status).toBe(200);
    const row = paged(auditLogDtoSchema).parse(res.body).result.data.find((a) => a.entityId === commandId);
    expect(row).toMatchObject({ actorEmail: ADMIN_EMAIL, actorType: "USER", action: "COMMAND_SUBMITTED" });
    expect(row?.data).toMatchObject({ deviceId: LED.deviceId, action: "SET_RELAY" });
  });

  it("GET /devices/:id/relay-changes shows relay 2 with source COMMAND", async () => {
    const change = await waitFor(
      async () => {
        const res = await auth(request(app).get(`${API}/devices/${ledId}/relay-changes?relay=2`));
        expect(res.status).toBe(200);
        return paged(relayChangeSchema).parse(res.body).result.data[0];
      },
      5000,
      "relay change row",
    );
    expect(change).toMatchObject({ relay: 2, state: true, source: "COMMAND", commandId, simulation: true });
  });
});
