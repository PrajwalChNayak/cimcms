import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  SOCKET_NAMESPACE,
  SOCKET_PATH,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SubscribeAck,
} from "@cimcms/contracts";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { closeRealtime, attachRealtime } from "@/realtime";
import { LED, startRig, type Rig } from "./rig";
import { mintToken } from "./helpers/tokens";
import { sleep, waitFor } from "./helpers/wait";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let rig: Rig;
let server: http.Server;
let base: string;
const clients: Client[] = [];

function client(token?: string): Client {
  const c: Client = connect(`${base}${SOCKET_NAMESPACE}`, {
    path: SOCKET_PATH,
    transports: ["websocket"],
    reconnection: false,
    ...(token !== undefined && { auth: { token } }),
  });
  clients.push(c);
  return c;
}

const connected = (c: Client): Promise<void> =>
  new Promise((resolve, reject) => {
    c.once("connect", () => resolve());
    c.once("connect_error", (e) => reject(e));
  });

const subscribe = (c: Client, deviceId: unknown): Promise<SubscribeAck> =>
  new Promise((resolve) =>
    (c as unknown as Socket).emit("subscribe:device", { deviceId }, (r: SubscribeAck) => resolve(r)),
  );

beforeAll(async () => {
  rig = await startRig();
  server = http.createServer();
  attachRealtime(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await rig.settle();
  await rig.reset();
});

afterAll(async () => {
  await closeRealtime();
  await rig.stop();
});

describe("realtime gateway", () => {
  it("rejects a connection without a token", async () => {
    const c = client();
    await expect(connected(c)).rejects.toMatchObject({ message: "UNAUTHENTICATED" });
  });

  it("rejects a garbage token and a token without DEVICE_READ", async () => {
    await expect(connected(client("garbage"))).rejects.toMatchObject({ message: "UNAUTHENTICATED" });
    const noPerm = mintToken("VIEWER", { permissions: ["ROOM_READ"] });
    await expect(connected(client(noPerm.token))).rejects.toMatchObject({ message: "FORBIDDEN" });
  });

  it("a refresh-type token is not accepted as an access token", async () => {
    const jwtMod = (await import("jsonwebtoken")).default;
    const t = jwtMod.sign(
      { userId: "x", permissions: ["DEVICE_READ"], typ: "refresh" },
      process.env.JWT_SECRET_KEY as string,
    );
    await expect(connected(client(t))).rejects.toMatchObject({ message: "UNAUTHENTICATED" });
  });

  it("a VIEWER subscribes and receives the current snapshot immediately", async () => {
    const c = client(mintToken("VIEWER").token);
    await connected(c);
    const snap = new Promise<{ deviceId: string; data: { liveness: string; relayStates: boolean[] } }>(
      (resolve) => c.once("device:status", (e) => resolve(e as never)),
    );
    expect(await subscribe(c, LED.deviceId)).toEqual({ ok: true });
    const e = await snap;
    expect(e.deviceId).toBe(LED.deviceId);
    expect(e.data.liveness).toBe("UNKNOWN"); // device registered, nothing received yet
    expect(e.data.relayStates).toEqual([]);
  });

  it("validates the subscribe payload and the device", async () => {
    const c = client(mintToken("VIEWER").token);
    await connected(c);
    expect(await subscribe(c, "x")).toEqual({ ok: false, error: "VALIDATION_FAILED" });
    expect(await subscribe(c, undefined)).toEqual({ ok: false, error: "VALIDATION_FAILED" });
    expect(await subscribe(c, "LED-NOPE")).toEqual({ ok: false, error: "DEVICE_NOT_FOUND" });
  });

  it("telemetry from the simulator reaches a subscribed client as device:status within 2 s", async () => {
    const c = client(mintToken("VIEWER").token);
    await connected(c);
    await subscribe(c, LED.deviceId);
    const seen: { liveness: string; relayStates: boolean[] }[] = [];
    c.on("device:status", (e) => seen.push(e.data));
    const t0 = Date.now();
    await rig.sim();
    await waitFor(() => seen.some((s) => s.relayStates.length === 16 && s.liveness === "ONLINE"), 2000, "status");
    expect(Date.now() - t0).toBeLessThan(2500);
  });

  it("a client that did not subscribe, or unsubscribed, receives nothing", async () => {
    const other = client(mintToken("VIEWER").token);
    const leaver = client(mintToken("VIEWER").token);
    await Promise.all([connected(other), connected(leaver)]);
    await subscribe(leaver, LED.deviceId);
    leaver.emit("unsubscribe:device", { deviceId: LED.deviceId });
    await sleep(100);

    let got = 0;
    other.on("device:status", () => got++);
    leaver.on("device:status", () => got++);
    leaver.on("device:telemetry", () => got++);
    await rig.sim();
    await waitFor(async () => (await rig.status())?.relayStates.length === 16, 5000, "snapshot");
    await sleep(200);
    expect(got).toBe(0);
  });

  it("disconnects the socket when its token expires", async () => {
    const c = client(mintToken("VIEWER", { expiresIn: 1 }).token);
    await connected(c);
    const gone = new Promise<string>((resolve) => c.once("disconnect", (reason) => resolve(reason)));
    expect(await gone).toBe("io server disconnect");
  });
});
