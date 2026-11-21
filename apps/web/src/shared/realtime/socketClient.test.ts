import { logout, setSession } from "@store/slices/authSlice";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiUrl, envelope } from "../../test/apiUrl";
import { server } from "../../test/server";
import { createTestStore, makeUser } from "../../test/utils";

import { sockets } from "../../test/fakeSocket";

vi.mock("socket.io-client", async () => {
  const { createFakeIo } = await import("../../test/fakeSocket");
  return { io: vi.fn(createFakeIo()) };
});

import {
  connectRealtime,
  onRealtime,
  resetRealtimeForTests,
  subscribeDevice,
  type RealtimeStore,
} from "./socketClient";

const last = () => sockets[sockets.length - 1];

const login = (store: ReturnType<typeof createTestStore>) =>
  store.dispatch(
    setSession({ accessToken: "tok-1", user: makeUser(["DEVICE_READ"]) }),
  );

beforeEach(() => {
  sockets.length = 0;
});
afterEach(() => resetRealtimeForTests());

describe("socketClient", () => {
  it("connects only after login and disconnects on logout", () => {
    const store = createTestStore();
    connectRealtime(store as unknown as RealtimeStore);
    expect(sockets).toHaveLength(0);

    login(store);
    expect(sockets).toHaveLength(1);
    expect(last().url).toBe("/realtime");
    expect(last().opts.transports).toEqual(["websocket"]);

    store.dispatch(logout());
    expect(sockets[0].disconnectCalls).toBe(1);
  });

  it("sends the current access token in the handshake auth callback", () => {
    const store = createTestStore();
    connectRealtime(store as unknown as RealtimeStore);
    login(store);
    const cb = vi.fn();
    last().opts.auth(cb);
    expect(cb).toHaveBeenCalledWith({ token: "tok-1" });
  });

  it("reference counts subscriptions: subscribe:device only for the first subscriber", () => {
    const store = createTestStore();
    connectRealtime(store as unknown as RealtimeStore);
    login(store);
    last().serverConnects();

    const off1 = subscribeDevice("LED-01");
    const off2 = subscribeDevice("LED-01");
    expect(last().subscribes()).toEqual(["LED-01"]);

    off1();
    off1(); // idempotent: must not release the second subscriber
    expect(last().emitted.some((e) => e.event === "unsubscribe:device")).toBe(false);

    off2();
    const unsubs = last().emitted.filter((e) => e.event === "unsubscribe:device");
    expect(unsubs).toHaveLength(1);
    expect(unsubs[0].args[0]).toEqual({ deviceId: "LED-01" });

    // after full release a new subscriber subscribes again
    subscribeDevice("LED-01");
    expect(last().subscribes()).toEqual(["LED-01", "LED-01"]);
  });

  it("re-sends all active subscriptions on every reconnect", () => {
    const store = createTestStore();
    connectRealtime(store as unknown as RealtimeStore);
    login(store);
    const s = last();

    // subscribed while still offline: nothing is sent yet
    subscribeDevice("LED-01");
    subscribeDevice("LED-02");
    expect(s.subscribes()).toEqual([]);

    s.serverConnects();
    expect(s.subscribes()).toEqual(["LED-01", "LED-02"]);

    s.connected = false;
    s.trigger("disconnect", "transport close");
    s.serverConnects();
    expect(s.subscribes()).toEqual(["LED-01", "LED-02", "LED-01", "LED-02"]);
  });

  it("dispatches typed server events to listeners until they are removed", () => {
    const store = createTestStore();
    connectRealtime(store as unknown as RealtimeStore);
    login(store);
    const handler = vi.fn();
    const off = onRealtime("device:status", handler);

    const envelopeA = { v: 1, deviceId: "LED-01", at: "2026-01-01T00:00:00.000Z", data: {} };
    last().trigger("device:status", envelopeA);
    expect(handler).toHaveBeenCalledWith(envelopeA);

    off();
    last().trigger("device:status", envelopeA);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("refreshes the token and reconnects after a server-initiated disconnect", async () => {
    let refreshCalls = 0;
    server.use(
      http.post(apiUrl("/user/token/refresh"), () => {
        refreshCalls += 1;
        return HttpResponse.json(
          envelope({ accessToken: "tok-2", user: makeUser(["DEVICE_READ"]) }),
        );
      }),
    );
    const store = createTestStore();
    connectRealtime(store as unknown as RealtimeStore);
    login(store);
    const s = last();
    s.serverConnects();

    s.connected = false;
    s.trigger("disconnect", "io server disconnect");

    await vi.waitFor(() => expect(s.connectCalls).toBe(1));
    expect(refreshCalls).toBe(1);
    const cb = vi.fn();
    s.opts.auth(cb);
    expect(cb).toHaveBeenCalledWith({ token: "tok-2" });
  });

  it("refreshes and reconnects on an auth connect_error", async () => {
    server.use(
      http.post(apiUrl("/user/token/refresh"), () =>
        HttpResponse.json(
          envelope({ accessToken: "tok-3", user: makeUser(["DEVICE_READ"]) }),
        ),
      ),
    );
    const store = createTestStore();
    connectRealtime(store as unknown as RealtimeStore);
    login(store);
    const s = last();

    s.trigger("connect_error", new Error("jwt expired"));
    await vi.waitFor(() => expect(s.connectCalls).toBe(1));
    expect(store.getState().auth.accessToken).toBe("tok-3");
  });

  it("does not reconnect when the refresh fails (session ended)", async () => {
    server.use(
      http.post(apiUrl("/user/token/refresh"), () =>
        HttpResponse.json({ message: "revoked" }, { status: 401 }),
      ),
    );
    const store = createTestStore();
    connectRealtime(store as unknown as RealtimeStore);
    login(store);
    const s = last();

    s.trigger("disconnect", "io server disconnect");
    await vi.waitFor(() => expect(store.getState().auth.isAuthenticated).toBe(false));
    expect(s.connectCalls).toBe(0);
    expect(s.disconnectCalls).toBe(1);
  });
});
