import type {
  CommandDto,
  DeviceEventDto,
  DeviceListItemDto,
  DeviceStateDto,
} from "@cimcms/contracts";
import {
  connectRealtime,
  resetRealtimeForTests,
  type RealtimeStore,
} from "@shared/realtime/socketClient";
import { formatIst } from "@shared/utils/time";
import { setSession } from "@store/slices/authSlice";
import CimcmsDashboard from "@view/home/dashboard/CimcmsDashboard";
import { act, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiUrl, envelope } from "../../test/apiUrl";
import { sockets } from "../../test/fakeSocket";
import { server } from "../../test/server";
import {
  createTestStore,
  makeUser,
  renderWithProviders,
} from "../../test/utils";

vi.mock("socket.io-client", async () => {
  const { createFakeIo } = await import("../../test/fakeSocket");
  return { io: vi.fn(createFakeIo()) };
});

const T0 = "2026-11-21T10:00:00.000Z";
const T1 = "2026-11-21T10:00:30.000Z";
const T2 = "2026-11-21T10:01:00.000Z";
const SYNC = "2026-11-21T06:00:00.000Z";

const ledState = (over: Partial<DeviceStateDto> = {}): DeviceStateDto => ({
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
  rtc: { valid: true, lastSyncUtc: SYNC, syncSource: "NTP", lastSyncResult: "OK" },
  configVersion: null,
  autoReady: null,
  updatedAt: T0,
  ...over,
});

const humState: DeviceStateDto = {
  deviceId: "HUM-01",
  type: "HUMIDIFIER",
  liveness: "ONLINE",
  lastSeenAt: T0,
  firmwareVersion: null,
  bootId: null,
  mode: null,
  modeStatus: null,
  simulationMode: null,
  relayStates: [],
  relayOnCount: 0,
  connectivity: null,
  rtc: null,
  configVersion: null,
  autoReady: null,
  updatedAt: T0,
};

const led: DeviceListItemDto = {
  id: "665f00000000000000000001",
  deviceId: "LED-01",
  name: "LED Controller 1",
  type: "LED_CONTROLLER",
  createdAt: T0,
  updatedAt: T0,
  state: ledState(),
};
const hum: DeviceListItemDto = {
  id: "665f00000000000000000002",
  deviceId: "HUM-01",
  name: "Humidifier 1",
  type: "HUMIDIFIER",
  createdAt: T0,
  updatedAt: T0,
  state: humState,
};
const steam: DeviceListItemDto = {
  id: "665f00000000000000000003",
  deviceId: "STEAM-01",
  name: "Steam Generator",
  type: "STEAM_GENERATOR",
  createdAt: T0,
  updatedAt: T0,
  state: null,
};

const cmd = (n: number, status: CommandDto["status"]): CommandDto => ({
  commandId: `00000000-0000-4000-8000-00000000000${n}`,
  deviceId: "LED-01",
  action: "SET_RELAY",
  params: { relay: n, state: "ON" },
  source: "web",
  status,
  reason: status === "REJECTED" ? "INVALID_RELAY" : null,
  lateResult: null,
  issuedBy: { id: "u1", email: "op@example.test" },
  issuedAt: `2026-11-21T09:0${n}:00.000Z`,
  expiresAt: `2026-11-21T09:0${n}:15.000Z`,
  publishedAt: null,
  completedAt: `2026-11-21T09:0${n}:20.000Z`,
  acks: [],
  simulation: true,
});

const event = (
  id: string,
  deviceId: string,
  type: DeviceEventDto["type"],
  at: string,
): DeviceEventDto => ({
  id,
  deviceId,
  type,
  origin: "DEVICE",
  data: {},
  deviceTs: null,
  receivedAt: at,
});

const page = <T,>(data: T[]) => ({
  data,
  pagination: { total: data.length, page: 1, limit: 50, totalPages: 1 },
});

let currentLed: DeviceStateDto;
let commands: CommandDto[];

beforeEach(() => {
  sockets.length = 0;
  currentLed = ledState();
  // 7 commands: 1 EXECUTED, 6 problems (the dashboard shows only the newest 5 problems)
  commands = [
    cmd(1, "EXECUTED"),
    cmd(2, "TIMEOUT"),
    cmd(3, "REJECTED"),
    cmd(4, "FAILED"),
    cmd(5, "TIMEOUT"),
    cmd(6, "PUBLISH_FAILED"),
    cmd(7, "FAILED"),
  ];
  server.use(
    http.get(apiUrl("/devices"), () =>
      HttpResponse.json(envelope(page([{ ...led, state: currentLed }, hum, steam]))),
    ),
    http.get(apiUrl(`/devices/${led.id}/state`), () =>
      HttpResponse.json(envelope(currentLed)),
    ),
    http.get(apiUrl(`/devices/${hum.id}/state`), () =>
      HttpResponse.json(envelope(humState)),
    ),
    http.get(apiUrl(`/devices/${led.id}/commands`), () =>
      HttpResponse.json(envelope(page(commands))),
    ),
    http.get(apiUrl(`/devices/${hum.id}/commands`), () =>
      HttpResponse.json(envelope(page([]))),
    ),
    http.get(apiUrl(`/devices/${led.id}/events`), () =>
      HttpResponse.json(
        envelope(
          page(
            Array.from({ length: 8 }, (_, i) =>
              event(`l${i}`, "LED-01", "RELAY_CHANGED", `2026-11-21T10:0${i}:00.000Z`),
            ),
          ),
        ),
      ),
    ),
    http.get(apiUrl(`/devices/${hum.id}/events`), () =>
      HttpResponse.json(
        envelope(
          page([
            event("h1", "HUM-01", "ONLINE", "2026-11-21T10:30:00.000Z"),
            event("h2", "HUM-01", "OFFLINE", "2026-11-21T10:20:00.000Z"),
            event("h3", "HUM-01", "ONLINE", "2026-11-21T10:10:00.000Z"),
          ]),
        ),
      ),
    ),
  );
});
afterEach(() => resetRealtimeForTests());

const last = () => sockets[sockets.length - 1];

const renderDashboard = () => {
  const store = createTestStore();
  store.dispatch(
    setSession({ accessToken: "tok", user: makeUser(["DEVICE_READ"]) }),
  );
  connectRealtime(store as unknown as RealtimeStore);
  const view = renderWithProviders(<CimcmsDashboard />, { store });
  act(() => last().serverConnects());
  return view;
};

describe("CimcmsDashboard", () => {
  it("renders every field from the fixture", async () => {
    renderDashboard();
    const card = await screen.findByTestId("dash-device-LED-01");

    expect(within(card).getByText("LED Controller 1")).toBeInTheDocument();
    expect(within(card).getByTestId("liveness-badge")).toHaveTextContent("Online");
    expect(within(card).getByText(new RegExp(formatIst(T0).replace(/[()]/g, "\\$&")))).toBeInTheDocument();
    expect(within(card).getByText("MANUAL")).toBeInTheDocument();
    expect(within(card).getByText("SIMULATION")).toBeInTheDocument();
    expect(within(card).getByText("3 / 16")).toBeInTheDocument();
    expect(within(card).getByText("10.0.0.5 · -55 dBm (Very good)")).toBeInTheDocument();
    const mqtt = within(card).getByText("MQTT connected").parentElement!;
    expect(mqtt).toHaveTextContent("Yes");
    const rtc = within(card).getByText("RTC valid").parentElement!;
    expect(rtc).toHaveTextContent("Yes");
    expect(within(card).getByText(formatIst(SYNC))).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Open control" })).toHaveAttribute(
      "href",
      "/devices/LED-01/control",
    );

    // monitor-only humidifier and planned device
    expect(within(screen.getByTestId("dash-device-HUM-01")).getByTestId("liveness-badge")).toHaveTextContent("Online");
    expect(within(screen.getByTestId("dash-device-STEAM-01")).getByText("Planned")).toBeInTheDocument();
  });

  it("lists the 5 newest failed / timed-out / rejected commands as alerts", async () => {
    renderDashboard();
    await screen.findByTestId("dash-device-LED-01");
    const list = await screen.findByTestId("alerts-list");
    const items = within(list).getAllByTestId("alert-COMMAND");
    expect(items).toHaveLength(5);
    // newest first: relays 7, 6, 5, 4, 3
    expect(items[0]).toHaveTextContent("LED-01: relay 7 ON");
    expect(items[0]).toHaveTextContent("Device reported a failure");
    expect(items[1]).toHaveTextContent("Could not reach the message broker");
    expect(items[2]).toHaveTextContent("No reply from device");
    expect(items[4]).toHaveTextContent("Rejected: INVALID_RELAY");
    expect(within(list).queryByText(/relay 1 ON/)).not.toBeInTheDocument();
  });

  it("shows the 10 most recent events across devices", async () => {
    renderDashboard();
    const list = await screen.findByTestId("events-list");
    await vi.waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(10));
    const rows = within(list).getAllByRole("listitem");
    // newest first: the three humidifier events (10:30, 10:20, 10:10) lead
    expect(rows[0]).toHaveTextContent("ONLINE");
    expect(rows[1]).toHaveTextContent("OFFLINE");
  });

  it("an RTC that is not valid raises an alert", async () => {
    currentLed = ledState({ rtc: { valid: false } });
    renderDashboard();
    expect(await screen.findByTestId("alert-RTC_INVALID")).toHaveTextContent(
      "LED-01: real-time clock is not valid",
    );
  });

  it("an alert appears when a device goes OFFLINE through the socket", async () => {
    renderDashboard();
    const card = await screen.findByTestId("dash-device-LED-01");
    await within(card).findByText("3 / 16");
    expect(screen.queryByTestId("alert-OFFLINE")).not.toBeInTheDocument();

    act(() =>
      last().trigger("device:status", {
        v: 1,
        deviceId: "LED-01",
        at: T2,
        data: ledState({ liveness: "OFFLINE", updatedAt: T2 }),
      }),
    );

    expect(await screen.findByTestId("alert-OFFLINE")).toHaveTextContent(
      "LED-01 is offline",
    );
    expect(within(card).getByTestId("liveness-badge")).toHaveTextContent("Offline");
  });

  it("a command that fails live shows up in the alerts", async () => {
    commands = [];
    renderDashboard();
    await screen.findByTestId("dash-device-LED-01");
    await screen.findByTestId("no-alerts");

    act(() =>
      last().trigger("command:updated", {
        v: 1,
        deviceId: "LED-01",
        at: T1,
        data: cmd(2, "TIMEOUT"),
      }),
    );
    expect(await screen.findByTestId("alert-COMMAND")).toHaveTextContent(
      "No reply from device",
    );
  });
});
