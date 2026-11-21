import type {
  DeviceEventDto,
  DeviceListItemDto,
  DeviceStateDto,
} from "@cimcms/contracts";
import { baseApi } from "@api/baseApi";
import { DevicesPage } from "@view/devices/DevicesPage";
import { DeviceDetailPage } from "@view/devices/DeviceDetailPage";
import { connectRealtime, type RealtimeStore } from "@shared/realtime/socketClient";
import { resetRealtimeForTests } from "@shared/realtime/socketClient";
import { setSession } from "@store/slices/authSlice";
import { act, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiUrl, envelope } from "../../test/apiUrl";
import { sockets } from "../../test/fakeSocket";
import { server } from "../../test/server";
import {
  createTestStore,
  makeUser,
  renderWithProviders,
  type TestStore,
} from "../../test/utils";
import { rssiLabel } from "./utils/rssi";
import { relayCountText } from "./utils/deviceTypeInfo";
import { formatIst, formatRelative } from "../../shared/utils/time";

vi.mock("socket.io-client", async () => {
  const { createFakeIo } = await import("../../test/fakeSocket");
  return { io: vi.fn(createFakeIo()) };
});
// echarts needs a canvas; the chart is not what these tests are about.
vi.mock("@shared/components/ui/LineChart", () => ({
  LineChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="rssi-chart">{data.length} points</div>
  ),
}));

const T0 = "2026-11-21T10:00:00.000Z";
const T1 = "2026-11-21T10:00:30.000Z";
const T2 = "2026-11-21T10:01:00.000Z";

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
  relayStates: [true, true, true, ...Array<boolean>(13).fill(false)],
  relayOnCount: 3,
  connectivity: {
    wifiConnected: true,
    ssid: "lab-net",
    ip: "10.0.0.5",
    rssiDbm: -55,
    mqttConnected: true,
  },
  rtc: { valid: true, syncSource: "NTP", lastSyncResult: "OK" },
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
const steam: DeviceListItemDto = {
  id: "665f00000000000000000002",
  deviceId: "STEAM-01",
  name: "Steam Generator",
  type: "STEAM_GENERATOR",
  createdAt: T0,
  updatedAt: T0,
  state: null,
};

const event = (id: string, type: DeviceEventDto["type"]): DeviceEventDto => ({
  id,
  deviceId: "LED-01",
  type,
  origin: "DEVICE",
  data: {},
  deviceTs: null,
  receivedAt: T1,
});

let stateRequests = 0;
let currentState: DeviceStateDto;

const useHandlers = () => {
  stateRequests = 0;
  currentState = state();
  server.use(
    http.get(apiUrl("/devices"), () =>
      HttpResponse.json(
        envelope({
          data: [led, steam],
          pagination: { total: 2, page: 1, limit: 100, totalPages: 1 },
        }),
      ),
    ),
    http.get(apiUrl(`/devices/${led.id}/state`), () => {
      stateRequests += 1;
      return HttpResponse.json(envelope(currentState));
    }),
    http.get(apiUrl(`/devices/${led.id}/events`), () =>
      HttpResponse.json(
        envelope({
          data: [event("e1", "BOOT")],
          pagination: { total: 1, page: 1, limit: 50, totalPages: 1 },
        }),
      ),
    ),
    http.get(apiUrl(`/devices/${led.id}/telemetry`), () =>
      HttpResponse.json(
        envelope([
          {
            ts: T1,
            mode: "MANUAL",
            simulationMode: true,
            relayStates: [],
            relayOnCount: 0,
            rssiDbm: -60,
            wifiConnected: true,
            mqttConnected: true,
          },
          {
            ts: T0,
            mode: "MANUAL",
            simulationMode: true,
            relayStates: [],
            relayOnCount: 0,
            rssiDbm: -55,
            wifiConnected: true,
            mqttConnected: true,
          },
        ]),
      ),
    ),
  );
};

const last = () => sockets[sockets.length - 1];
const envelopeOf = <T,>(data: T, at = T2) => ({
  v: 1,
  deviceId: "LED-01",
  at,
  data,
});

const renderDetail = (store: TestStore) => {
  store.dispatch(
    setSession({ accessToken: "tok", user: makeUser(["DEVICE_READ"]) }),
  );
  connectRealtime(store as unknown as RealtimeStore);
  const view = renderWithProviders(
    <Routes>
      <Route path="/devices/:deviceId" element={<DeviceDetailPage />} />
    </Routes>,
    { store, route: "/devices/LED-01" },
  );
  last().serverConnects();
  return view;
};

beforeEach(() => {
  sockets.length = 0;
  useHandlers();
});
afterEach(() => resetRealtimeForTests());

describe("DevicesPage", () => {
  it("lists devices with liveness, last seen (IST), firmware, relay count, simulation and planned badges", async () => {
    const store = createTestStore();
    store.dispatch(
      setSession({ accessToken: "tok", user: makeUser(["DEVICE_READ"]) }),
    );
    connectRealtime(store as unknown as RealtimeStore);
    renderWithProviders(<DevicesPage />, { store });

    const card = await screen.findByTestId("device-card-LED-01");
    expect(within(card).getByText("LED Controller 1")).toBeInTheDocument();
    expect(within(card).getByTestId("liveness-badge")).toHaveTextContent("Online");
    expect(within(card).getByText("1.2.3")).toBeInTheDocument();
    expect(within(card).getByText("3 / 16")).toBeInTheDocument();
    expect(within(card).getByText("SIMULATION")).toBeInTheDocument();
    expect(within(card).getByText(formatIst(T0))).toBeInTheDocument();

    const planned = screen.getByTestId("device-card-STEAM-01");
    expect(within(planned).getByText("Planned")).toBeInTheDocument();
    expect(within(planned).queryByTestId("liveness-badge")).not.toBeInTheDocument();
  });
});

describe("DeviceDetailPage", () => {
  it("shows state, connectivity with RSSI label, RTC, events and the RSSI chart", async () => {
    renderDetail(createTestStore());

    expect(
      await screen.findByRole("heading", { name: "LED Controller 1" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("-55 dBm — Very good")).toBeInTheDocument();
    expect(screen.getByText("lab-net")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.5")).toBeInTheDocument();
    expect(screen.getByText("Real-time clock")).toBeInTheDocument();
    expect(await screen.findByTestId("events-list")).toHaveTextContent("BOOT");
    expect(await screen.findByTestId("rssi-chart")).toHaveTextContent("2 points");
    expect(screen.getByTestId("simulation-banner")).toHaveTextContent(
      "SIMULATION MODE — relays are not energised. States shown are logical (commanded) states, not lamp output.",
    );
    expect(screen.getByRole("link", { name: "Open control page" })).toHaveAttribute(
      "href",
      "/devices/LED-01/control",
    );
  });

  it("subscribes to the device room and releases it when the cache entries are removed", async () => {
    const store = createTestStore();
    const { unmount } = renderDetail(store);
    await screen.findByText("-55 dBm — Very good");

    const subs = () =>
      last()
        .emitted.filter((e) => e.event === "subscribe:device")
        .map((e) => (e.args[0] as { deviceId: string }).deviceId);
    expect(subs()).toContain("LED-01");

    // Cache entries outlive the page (keepUnusedDataFor), so the room stays
    // subscribed until they are dropped.
    unmount();
    expect(
      last().emitted.some((e) => e.event === "unsubscribe:device"),
    ).toBe(false);
    act(() => {
      store.dispatch(baseApi.util.resetApiState());
    });
    await vi.waitFor(() =>
      expect(
        last().emitted.some((e) => e.event === "unsubscribe:device"),
      ).toBe(true),
    );
  });

  it("a live device:status updates the page without a refetch", async () => {
    renderDetail(createTestStore());
    expect(await screen.findByText("3 / 16")).toBeInTheDocument();
    expect(stateRequests).toBe(1);

    act(() => {
      last().trigger(
        "device:status",
        envelopeOf(
          state({
            updatedAt: T1,
            liveness: "STALE",
            relayStates: [true, ...Array<boolean>(15).fill(false)],
            relayOnCount: 1,
          }),
          T1,
        ),
      );
    });

    expect(await screen.findByText("1 / 16")).toBeInTheDocument();
    expect(screen.getByTestId("liveness-badge")).toHaveTextContent("Stale");
    expect(stateRequests).toBe(1);
  });

  it("ignores a device:status whose updatedAt is older than the cache", async () => {
    renderDetail(createTestStore());
    expect(await screen.findByText("3 / 16")).toBeInTheDocument();

    act(() => {
      last().trigger(
        "device:status",
        envelopeOf(
          state({
            updatedAt: T2,
            relayStates: [true, true, ...Array<boolean>(14).fill(false)],
            relayOnCount: 2,
          }),
          T2,
        ),
      );
    });
    expect(await screen.findByText("2 / 16")).toBeInTheDocument();

    act(() => {
      last().trigger(
        "device:status",
        envelopeOf(
          state({
            updatedAt: T1, // older than T2 already shown
            liveness: "OFFLINE",
            relayStates: Array<boolean>(16).fill(false),
            relayOnCount: 0,
          }),
          T1,
        ),
      );
    });

    expect(screen.getByText("2 / 16")).toBeInTheDocument();
    expect(screen.getByTestId("liveness-badge")).toHaveTextContent("Online");
    expect(stateRequests).toBe(1);
  });

  it("prepends live device:event items without duplicating", async () => {
    renderDetail(createTestStore());
    const list = await screen.findByTestId("events-list");
    expect(list.querySelectorAll("li")).toHaveLength(1);

    const live = envelopeOf(event("e2", "WIFI"));
    act(() => {
      last().trigger("device:event", live);
      last().trigger("device:event", live); // duplicate delivery
    });

    const items = await vi.waitFor(() => {
      const li = screen.getByTestId("events-list").querySelectorAll("li");
      expect(li).toHaveLength(2);
      return li;
    });
    expect(items[0]).toHaveTextContent("WIFI");
    expect(items[1]).toHaveTextContent("BOOT");
  });

  it("shows not found for an unknown deviceId", async () => {
    const store = createTestStore();
    store.dispatch(
      setSession({ accessToken: "tok", user: makeUser(["DEVICE_READ"]) }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/devices/:deviceId" element={<DeviceDetailPage />} />
      </Routes>,
      { store, route: "/devices/NOPE-99" },
    );
    expect(await screen.findByText("Device not found")).toBeInTheDocument();
  });
});

describe("helpers", () => {
  it("rssiLabel follows the FRS table", () => {
    expect(rssiLabel(-30)).toBe("Excellent");
    expect(rssiLabel(-50)).toBe("Excellent");
    expect(rssiLabel(-51)).toBe("Very good");
    expect(rssiLabel(-60)).toBe("Very good");
    expect(rssiLabel(-61)).toBe("Good");
    expect(rssiLabel(-70)).toBe("Good");
    expect(rssiLabel(-71)).toBe("Weak");
    expect(rssiLabel(-80)).toBe("Weak");
    expect(rssiLabel(-81)).toBe("Very weak");
  });

  it("formatIst shows Asia/Kolkata (UTC+05:30) and handles null", () => {
    // 10:00 UTC == 3:30 pm IST
    expect(formatIst("2026-11-21T10:00:00.000Z")).toMatch(/3:30:00\s?pm/i);
    expect(formatIst(null)).toBe("—");
  });

  it("formatRelative", () => {
    const now = Date.parse(T2);
    expect(formatRelative(T2, now)).toBe("just now");
    expect(formatRelative(T0, now)).toBe("1m ago");
    expect(formatRelative("2026-11-21T07:01:00.000Z", now)).toBe("3h ago");
    expect(formatRelative(undefined, now)).toBe("—");
  });

  it("relayCountText", () => {
    expect(relayCountText("LED_CONTROLLER", [true, false], 1)).toBe("1 / 16");
    expect(relayCountText("LED_CONTROLLER", [], 0)).toBe("—");
    expect(relayCountText("HUMIDIFIER", [], 0)).toBe("—");
  });
});
