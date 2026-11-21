import type { CommandDto, DeviceListItemDto, DeviceStateDto } from "@cimcms/contracts";
import {
  connectRealtime,
  resetRealtimeForTests,
  type RealtimeStore,
} from "@shared/realtime/socketClient";
import { setSession } from "@store/slices/authSlice";
import { SystemPage } from "@view/system/SystemPage";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiUrl, envelope } from "../../test/apiUrl";
import { sockets } from "../../test/fakeSocket";
import { server } from "../../test/server";
import { createTestStore, makeUser, renderWithProviders } from "../../test/utils";

vi.mock("socket.io-client", async () => {
  const { createFakeIo } = await import("../../test/fakeSocket");
  return { io: vi.fn(createFakeIo()) };
});

const T0 = "2026-11-21T10:00:00.000Z";
const T1 = "2026-11-21T10:00:05.000Z";

const state = (over: Partial<DeviceStateDto> = {}): DeviceStateDto => ({
  deviceId: "LED-01",
  type: "LED_CONTROLLER",
  liveness: "ONLINE",
  lastSeenAt: T0,
  firmwareVersion: "1.2.3",
  bootId: "boot-1",
  mode: "MANUAL",
  modeStatus: null,
  simulationMode: true,
  relayStates: Array<boolean>(16).fill(false),
  relayOnCount: 0,
  connectivity: { wifiConnected: true, ssid: "farm-net", ip: "10.0.0.5", rssiDbm: -61, mqttConnected: true },
  rtc: {
    valid: true,
    timeUtc: T0,
    syncSource: "NTP",
    lastSyncUtc: T0,
    lastSyncResult: "OK",
    driftMs: 42,
    lostPower: false,
  },
  configVersion: null,
  autoReady: null,
  updatedAt: T0,
  ...over,
});

const led: DeviceListItemDto = {
  id: "665f00000000000000000001",
  deviceId: "LED-01",
  name: "LED Controller 1",
  type: "LED_CONTROLLER",
  createdAt: T0,
  updatedAt: T0,
  state: state(),
};

const command = (over: Partial<CommandDto> = {}): CommandDto => ({
  commandId: "22222222-2222-4222-8222-222222222222",
  deviceId: "LED-01",
  action: "RTC_SYNC_NOW",
  params: {},
  source: "web",
  status: "PENDING",
  reason: null,
  lateResult: null,
  issuedBy: { id: "u1", email: "tech@example.test" },
  issuedAt: T1,
  expiresAt: "2026-11-21T10:00:20.000Z",
  publishedAt: null,
  completedAt: null,
  acks: [],
  simulation: true,
  ...over,
});

const page = <T,>(data: T[]) => ({
  data,
  pagination: { total: data.length, page: 1, limit: 100, totalPages: 1 },
});

let currentState: DeviceStateDto;
let posts: Array<string | null>;
let mqtt: "up" | "down";

beforeEach(() => {
  sockets.length = 0;
  currentState = state();
  posts = [];
  mqtt = "up";
  server.use(
    http.get(apiUrl("/devices"), () =>
      HttpResponse.json(envelope(page([{ ...led, state: currentState }]))),
    ),
    http.get(apiUrl(`/devices/${led.id}/state`), () => HttpResponse.json(envelope(currentState))),
    http.get(apiUrl(`/devices/${led.id}/commands`), () => HttpResponse.json(envelope(page([])))),
    http.get(apiUrl("/system/status"), () =>
      HttpResponse.json(envelope({ status: mqtt === "up" ? "ok" : "unavailable", mongo: "up", mqtt })),
    ),
    http.post(apiUrl(`/devices/${led.id}/rtc-sync`), ({ request }) => {
      posts.push(request.headers.get("idempotency-key"));
      return HttpResponse.json(envelope(command()), { status: 202 });
    }),
  );
});
afterEach(() => resetRealtimeForTests());

const last = () => sockets[sockets.length - 1];

const renderSystem = (permissions: string[]) => {
  const store = createTestStore();
  store.dispatch(setSession({ accessToken: "tok", user: makeUser(permissions) }));
  connectRealtime(store as unknown as RealtimeStore);
  const view = renderWithProviders(<SystemPage />, { store, route: "/system" });
  act(() => last().serverConnects());
  return { store, ...view };
};

const ADMIN = ["DEVICE_READ", "DEVICE_DIAGNOSTICS", "DEVICE_MANAGE"];

describe("SystemPage", () => {
  it("shows the RTC and Wi-Fi blocks of each controller and the planned Wi-Fi scan note", async () => {
    renderSystem(["DEVICE_READ", "DEVICE_DIAGNOSTICS"]);
    const card = await screen.findByTestId("system-device-LED-01");
    expect(card).toHaveTextContent("Real-time clock");
    expect(card).toHaveTextContent("NTP");
    expect(card).toHaveTextContent("42 ms");
    expect(card).toHaveTextContent("farm-net");
    expect(card).toHaveTextContent("-61 dBm");
    expect(screen.getByTestId("wifi-scan-planned")).toHaveTextContent("planned");
  });

  it("shows the MQTT backend connection to admins only", async () => {
    const { unmount } = renderSystem(ADMIN);
    await screen.findByTestId("backend-status");
    await waitFor(() => expect(screen.getByTestId("backend-status")).toHaveTextContent("MQTT broker: Connected"));
    unmount();
    renderSystem(["DEVICE_READ", "DEVICE_DIAGNOSTICS"]);
    await screen.findByTestId("system-device-LED-01");
    expect(screen.queryByTestId("backend-status")).not.toBeInTheDocument();
  });

  it("shows a broker that is not connected", async () => {
    mqtt = "down";
    renderSystem(ADMIN);
    await screen.findByTestId("backend-status");
    await waitFor(() =>
      expect(screen.getByTestId("backend-status")).toHaveTextContent("MQTT broker: Not connected"),
    );
  });

  it("Sync clock now: one request with an Idempotency-Key, pending, then the result from the socket", async () => {
    renderSystem(ADMIN);
    fireEvent.click(await screen.findByRole("button", { name: "Sync clock now" }));
    expect(await screen.findByTestId("rtc-pending")).toHaveTextContent("Pending — waiting for device…");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByRole("button", { name: "Sync clock now" })).toBeDisabled();

    act(() =>
      last().trigger("command:updated", {
        v: 1,
        deviceId: "LED-01",
        at: T1,
        data: command({ status: "FAILED", reason: "RTC_SYNC_FAILED", completedAt: T1 }),
      }),
    );
    expect(await screen.findByTestId("rtc-result")).toHaveTextContent("Device reported a failure");
    expect(screen.getByRole("button", { name: "Sync clock now" })).toBeEnabled();
  });

  it("has no sync button without DEVICE_DIAGNOSTICS and disables it for an offline device", async () => {
    const { unmount } = renderSystem(["DEVICE_READ"]);
    await screen.findByTestId("system-device-LED-01");
    expect(screen.queryByRole("button", { name: "Sync clock now" })).not.toBeInTheDocument();
    unmount();

    currentState = state({ liveness: "OFFLINE" });
    renderSystem(ADMIN);
    const button = await screen.findByRole("button", { name: "Sync clock now" });
    expect(button).toBeDisabled();
    expect(await screen.findByText("Device offline — commands disabled")).toBeInTheDocument();
  });

  it("shows the server message when the request is refused", async () => {
    server.use(
      http.post(apiUrl(`/devices/${led.id}/rtc-sync`), () =>
        HttpResponse.json({ statusCode: 403, message: "Forbidden: missing permission(s)", errorCode: "FORBIDDEN" }, { status: 403 }),
      ),
    );
    renderSystem(ADMIN);
    fireEvent.click(await screen.findByRole("button", { name: "Sync clock now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
  });
});
