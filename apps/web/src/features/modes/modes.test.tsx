import type {
  CommandDto,
  DeviceListItemDto,
  DeviceReadinessDto,
  DeviceStateDto,
} from "@cimcms/contracts";
import {
  connectRealtime,
  resetRealtimeForTests,
  type RealtimeStore,
} from "@shared/realtime/socketClient";
import { setSession } from "@store/slices/authSlice";
import { ModePage } from "@view/devices/ModePage";
import { act, fireEvent, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router-dom";
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
  connectivity: { wifiConnected: true, mqttConnected: true },
  rtc: { valid: true },
  configVersion: null,
  autoReady: null,
  updatedAt: T0,
  ...over,
});

const led: DeviceListItemDto = {
  id: "665f0000-0000-4000-8000-000000000001",
  deviceId: "LED-01",
  name: "LED Controller 1",
  type: "LED_CONTROLLER",
  createdAt: T0,
  updatedAt: T0,
  state: state(),
};

const readiness = (over: Partial<DeviceReadinessDto> = {}): DeviceReadinessDto => ({
  deviceId: "LED-01",
  auto: { ready: false, reasons: ["NO_CONFIG"], configVersion: null, effectiveFrom: null, effectiveTo: null },
  experiment: { ready: false, reasons: ["NO_READY_EXPERIMENT"], experimentId: null, experimentCode: null },
  ...over,
});

const command = (over: Partial<CommandDto> = {}): CommandDto => ({
  commandId: "11111111-1111-4111-8111-111111111111",
  deviceId: "LED-01",
  action: "SET_MODE",
  params: { mode: "MAINTENANCE" },
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
let currentReadiness: DeviceReadinessDto;
let posts: unknown[];

beforeEach(() => {
  sockets.length = 0;
  currentState = state();
  currentReadiness = readiness();
  posts = [];
  server.use(
    http.get(apiUrl("/devices"), () =>
      HttpResponse.json(envelope(page([{ ...led, state: currentState }]))),
    ),
    http.get(apiUrl(`/devices/${led.id}/state`), () => HttpResponse.json(envelope(currentState))),
    http.get(apiUrl(`/devices/${led.id}/readiness`), () => HttpResponse.json(envelope(currentReadiness))),
    http.get(apiUrl(`/devices/${led.id}/events`), () =>
      HttpResponse.json(
        envelope(
          page([
            {
              id: "e1",
              deviceId: "LED-01",
              type: "MODE_CHANGED",
              origin: "DEVICE",
              data: { mode: "MANUAL", previous: "MAINTENANCE" },
              deviceTs: T0,
              receivedAt: T0,
            },
          ]),
        ),
      ),
    ),
    http.get(apiUrl(`/devices/${led.id}/commands`), () => HttpResponse.json(envelope(page([])))),
    http.post(apiUrl(`/devices/${led.id}/commands`), async ({ request }) => {
      posts.push(await request.json());
      return HttpResponse.json(envelope(command()), { status: 202 });
    }),
  );
});
afterEach(() => resetRealtimeForTests());

const last = () => sockets[sockets.length - 1];

const renderMode = (permissions: string[], roles: string[] = ["OPERATOR"]) => {
  const store = createTestStore();
  store.dispatch(setSession({ accessToken: "tok", user: makeUser(permissions, { roles }) }));
  connectRealtime(store as unknown as RealtimeStore);
  const view = renderWithProviders(
    <Routes>
      <Route path="/devices/:deviceId/mode" element={<ModePage />} />
    </Routes>,
    { store, route: "/devices/LED-01/mode" },
  );
  act(() => last().serverConnects());
  return { store, ...view };
};

const OPERATOR = ["DEVICE_READ", "DEVICE_COMMAND", "DEVICE_MODE_SET"];

describe("ModePage", () => {
  it("shows the current mode, readiness reasons, blocked modes and the history", async () => {
    renderMode(OPERATOR);
    expect(await screen.findByTestId("current-mode")).toHaveTextContent("Manual");

    const auto = await screen.findByTestId("readiness-auto");
    expect(auto).toHaveTextContent("Not ready");
    expect(auto).toHaveTextContent("No schedule has been sent to this device yet");
    expect(screen.getByTestId("readiness-experiment")).toHaveTextContent("No experiment is ready for this device");

    expect(screen.getByRole("button", { name: "Switch to Auto (schedule)" })).toBeDisabled();
    expect(screen.getByTestId("mode-blocked-AUTO")).toHaveTextContent("No schedule has been sent");
    expect(screen.getByRole("button", { name: "Switch to Experiment" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Switch to Maintenance" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Switch to Manual" })).toBeDisabled(); // current

    const history = await screen.findByTestId("mode-history");
    expect(history).toHaveTextContent("MAINTENANCE → MANUAL");
  });

  it("asks for confirmation, then sends SET_MODE and shows pending, then the result", async () => {
    renderMode(OPERATOR);
    fireEvent.click(await screen.findByRole("button", { name: "Switch to Maintenance" }));

    // Cancel sends nothing.
    expect(screen.getByText("Switch LED-01 to Maintenance mode?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(posts).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Switch to Maintenance" }));
    // Card button and dialog confirm button share the label: the dialog renders last.
    const buttons = screen.getAllByRole("button", { name: "Switch to Maintenance" });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1] as HTMLElement);
    expect(await screen.findByTestId("mode-last-result")).toHaveTextContent("Pending — waiting for device…");
    expect(posts).toEqual([{ action: "SET_MODE", mode: "MAINTENANCE" }]);

    act(() =>
      last().trigger("command:updated", {
        v: 1,
        deviceId: "LED-01",
        at: T1,
        data: command({ status: "EXECUTED", completedAt: T1 }),
      }),
    );
    expect(await screen.findByTestId("command-status-pill")).toHaveTextContent("Done");
  });

  it("enables AUTO when the device is ready", async () => {
    currentReadiness = readiness({
      auto: { ready: true, reasons: [], configVersion: 3, effectiveFrom: "2026-11-01", effectiveTo: null },
    });
    renderMode(OPERATOR);
    const button = await screen.findByRole("button", { name: "Switch to Auto (schedule)" });
    await screen.findByText("Ready");
    expect(button).toBeEnabled();
  });

  // TODO(owner-decision O-4): technician may only enter / leave MAINTENANCE.
  it("a technician may only enter MAINTENANCE", async () => {
    currentReadiness = readiness({
      auto: { ready: true, reasons: [], configVersion: 3, effectiveFrom: "2026-11-01", effectiveTo: null },
    });
    renderMode(["DEVICE_READ", "DEVICE_COMMAND", "DEVICE_MODE_SET", "DEVICE_DIAGNOSTICS"], ["TECHNICIAN"]);
    await screen.findByTestId("current-mode");
    expect(await screen.findByRole("button", { name: "Switch to Maintenance" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Switch to Auto (schedule)" })).toBeDisabled();
    expect(screen.getByTestId("mode-blocked-AUTO")).toHaveTextContent(
      "Technicians can only enter and leave Maintenance mode",
    );
  });

  it("a technician may leave MAINTENANCE for MANUAL", async () => {
    currentState = state({ mode: "MAINTENANCE" });
    renderMode(["DEVICE_READ", "DEVICE_COMMAND", "DEVICE_MODE_SET"], ["TECHNICIAN"]);
    expect(await screen.findByRole("button", { name: "Switch to Manual" })).toBeEnabled();
  });

  it("has no switch buttons without DEVICE_MODE_SET", async () => {
    renderMode(["DEVICE_READ", "DEVICE_COMMAND"]);
    await screen.findByTestId("current-mode");
    expect(screen.queryByRole("button", { name: /^Switch to/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("mode-blocked-MAINTENANCE")).toHaveTextContent(
      "You do not have permission to change the operating mode",
    );
  });

  it("disables every mode with the offline text when the device is offline", async () => {
    currentState = state({ liveness: "OFFLINE" });
    renderMode(OPERATOR);
    await screen.findByTestId("current-mode");
    expect(await screen.findByTestId("mode-blocked-MAINTENANCE")).toHaveTextContent(
      "Device offline — commands disabled",
    );
    expect(screen.getByRole("button", { name: "Switch to Maintenance" })).toBeDisabled();
  });

  it("shows the server message when the request is refused", async () => {
    server.use(
      http.post(apiUrl(`/devices/${led.id}/commands`), () =>
        HttpResponse.json(
          { statusCode: 409, message: "AUTO mode is not configured for this device", errorCode: "AUTO_NOT_CONFIGURED" },
          { status: 409 },
        ),
      ),
    );
    renderMode(OPERATOR);
    fireEvent.click(await screen.findByRole("button", { name: "Switch to Maintenance" }));
    const confirm = screen.getAllByRole("button", { name: "Switch to Maintenance" });
    fireEvent.click(confirm[confirm.length - 1] as HTMLElement);
    expect(await screen.findByRole("alert")).toHaveTextContent("AUTO mode is not configured for this device");
  });
});
