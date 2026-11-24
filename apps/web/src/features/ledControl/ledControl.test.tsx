import type {
  CommandDto,
  DeviceListItemDto,
  DeviceStateDto,
} from "@cimcms/contracts";
import commandsReducer, {
  commandUpdated,
} from "@features/commands/store/commandsSlice";
import {
  connectRealtime,
  resetRealtimeForTests,
  type RealtimeStore,
} from "@shared/realtime/socketClient";
import { setSession } from "@store/slices/authSlice";
import { LedControlPage } from "@view/devices/LedControlPage";
import { act, fireEvent, screen, within } from "@testing-library/react";
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
} from "../../test/utils";

vi.mock("socket.io-client", async () => {
  const { createFakeIo } = await import("../../test/fakeSocket");
  return { io: vi.fn(createFakeIo()) };
});

const T0 = "2026-11-21T10:00:00.000Z";
const T1 = "2026-11-21T10:00:05.000Z";
const T2 = "2026-11-21T10:00:10.000Z";

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

const command = (over: Partial<CommandDto> = {}): CommandDto => ({
  commandId: "11111111-1111-4111-8111-111111111111",
  deviceId: "LED-01",
  action: "SET_RELAY",
  params: { relay: 5, state: "ON" },
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

let currentState: DeviceStateDto;
let posts: Array<{ body: unknown; key: string | null }>;
let nonTerminal: CommandDto[];
let postResponse: () => Response;

const page = <T,>(data: T[]) => ({
  data,
  pagination: { total: data.length, page: 1, limit: 100, totalPages: 1 },
});

beforeEach(() => {
  sockets.length = 0;
  currentState = state();
  posts = [];
  nonTerminal = [];
  postResponse = () => HttpResponse.json(envelope(command()), { status: 202 });
  server.use(
    http.get(apiUrl("/devices"), () =>
      HttpResponse.json(envelope(page([{ ...led, state: currentState }]))),
    ),
    http.get(apiUrl(`/devices/${led.id}/state`), () =>
      HttpResponse.json(envelope(currentState)),
    ),
    http.get(apiUrl(`/devices/${led.id}/relay-changes`), () =>
      HttpResponse.json(
        envelope(
          page([
            {
              id: "rc1",
              deviceId: "LED-01",
              relay: 1,
              state: true,
              source: "COMMAND",
              commandId: null,
              simulation: true,
              at: T1,
            },
          ]),
        ),
      ),
    ),
    http.get(apiUrl(`/devices/${led.id}/commands`), ({ request }) => {
      const status = new URL(request.url).searchParams.get("status");
      const list = nonTerminal.filter((c) => c.status === status);
      return HttpResponse.json(envelope(page(list)));
    }),
    http.post(apiUrl(`/devices/${led.id}/commands`), async ({ request }) => {
      posts.push({
        body: await request.json(),
        key: request.headers.get("idempotency-key"),
      });
      return postResponse();
    }),
  );
});
afterEach(() => resetRealtimeForTests());

const last = () => sockets[sockets.length - 1];
const env = <T,>(data: T, at = T2) => ({ v: 1, deviceId: "LED-01", at, data });

const renderControl = (permissions: string[]) => {
  const store = createTestStore();
  store.dispatch(
    setSession({ accessToken: "tok", user: makeUser(permissions) }),
  );
  connectRealtime(store as unknown as RealtimeStore);
  const view = renderWithProviders(
    <Routes>
      <Route path="/devices/:deviceId/control" element={<LedControlPage />} />
    </Routes>,
    { store, route: "/devices/LED-01/control" },
  );
  act(() => last().serverConnects());
  return { store, ...view };
};

const TECH = ["DEVICE_READ", "DEVICE_COMMAND"];
const OPERATOR = ["DEVICE_READ", "DEVICE_COMMAND", "DEVICE_COMMAND_BULK"];

const waitForGrid = () => screen.findByTestId("relay-grid");

describe("LedControlPage: texts and safety wording", () => {
  it("shows the exact simulation banner and Logical: labels for all 16 relays", async () => {
    renderControl(TECH);
    await waitForGrid();
    expect(screen.getByTestId("simulation-banner")).toHaveTextContent(
      "SIMULATION MODE — relays are not energised. States shown are logical (commanded) states, not lamp output.",
    );
    expect(screen.getAllByText("Logical: ON")).toHaveLength(3);
    expect(screen.getAllByText("Logical: OFF")).toHaveLength(13);
    expect(screen.getAllByTestId(/^relay-card-/)).toHaveLength(16);
    // never claims a lamp is on
    const text = document.body.textContent?.toLowerCase() ?? "";
    expect(text).not.toContain("lamp on");
    expect(text).not.toContain("light is on");
  });

  it("uses the hardware labels and no banner when simulationMode is false", async () => {
    currentState = state({ simulationMode: false });
    renderControl(TECH);
    await waitForGrid();
    expect(screen.queryByTestId("simulation-banner")).not.toBeInTheDocument();
    expect(screen.getAllByText("Relay: ON (no lamp feedback)")).toHaveLength(3);
    expect(screen.getAllByText("Relay: OFF")).toHaveLength(13);
  });
});

describe("LedControlPage: single relay command", () => {
  it("click ON -> pending (no optimistic state) -> command:updated EXECUTED -> Done, pending cleared", async () => {
    renderControl(TECH);
    await waitForGrid();

    fireEvent.click(screen.getByRole("button", { name: "Set relay 5 ON" }));

    // single relay: no confirmation (TODO owner decision O-6)
    const pending = await screen.findByTestId("relay-pending-5");
    expect(pending).toHaveTextContent("Pending — waiting for device…");
    expect(pending).toHaveTextContent("→ ON");
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ action: "SET_RELAY", relay: 5, state: "ON" });
    expect(posts[0].key).toMatch(/^[0-9a-f-]{36}$/);
    // reported state is still OFF: the UI never shows the requested state as the relay state
    expect(
      within(screen.getByTestId("relay-card-5")).getByText("Logical: OFF"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set relay 5 ON" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Set relay 5 OFF" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Set relay 6 ON" })).toBeEnabled();

    act(() =>
      last().trigger("command:updated", env(command({ status: "PUBLISHED" }))),
    );
    expect(screen.getByTestId("relay-pending-5")).toBeInTheDocument();

    act(() =>
      last().trigger(
        "command:updated",
        env(command({ status: "EXECUTED", completedAt: T2 })),
      ),
    );
    const result = await screen.findByTestId("relay-result-5");
    expect(result).toHaveTextContent("Done");
    expect(screen.queryByTestId("relay-pending-5")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set relay 5 ON" })).toBeEnabled();

    // the reported state changes only through telemetry
    act(() =>
      last().trigger(
        "device:status",
        env(
          state({
            updatedAt: T2,
            relayStates: [true, true, true, false, true, ...Array<boolean>(11).fill(false)],
            relayOnCount: 4,
          }),
        ),
      ),
    );
    expect(
      await within(screen.getByTestId("relay-card-5")).findByText("Logical: ON"),
    ).toBeInTheDocument();
  });

  it.each([
    [{ status: "TIMEOUT" as const }, "No reply from device"],
    [
      { status: "TIMEOUT" as const, lateResult: "EXECUTED" },
      "No reply from device — device later reported EXECUTED",
    ],
    [{ status: "REJECTED" as const, reason: "INVALID_RELAY" }, "Rejected: INVALID_RELAY"],
    [{ status: "EXPIRED" as const }, "Expired before the device ran it"],
    [{ status: "FAILED" as const }, "Device reported a failure"],
    [{ status: "PUBLISH_FAILED" as const }, "Could not reach the message broker"],
    [{ status: "DUPLICATE" as const }, "Duplicate — ignored by device"],
  ])("shows %j as '%s'", async (over, text) => {
    renderControl(TECH);
    await waitForGrid();
    fireEvent.click(screen.getByRole("button", { name: "Set relay 5 ON" }));
    await screen.findByTestId("relay-pending-5");
    act(() =>
      last().trigger(
        "command:updated",
        env(command({ ...over, completedAt: T2 })),
      ),
    );
    expect(await screen.findByTestId("relay-result-5")).toHaveTextContent(
      new RegExp(`^${text}$`),
    );
    expect(screen.queryByTestId("relay-pending-5")).not.toBeInTheDocument();
  });

  it("shows the server's refusal text and sends nothing twice", async () => {
    postResponse = () =>
      HttpResponse.json(
        { statusCode: 409, message: "Device is offline", errorCode: "DEVICE_OFFLINE" },
        { status: 409 },
      );
    renderControl(TECH);
    await waitForGrid();
    fireEvent.click(screen.getByRole("button", { name: "Set relay 2 OFF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Device is offline");
    expect(screen.queryByTestId("relay-pending-2")).not.toBeInTheDocument();
    expect(posts).toHaveLength(1);
  });

  it("restores pending state after a reload from the non-terminal commands list", async () => {
    nonTerminal = [command({ status: "PUBLISHED", publishedAt: T1 })];
    renderControl(TECH);
    expect(await screen.findByTestId("relay-pending-5")).toHaveTextContent(
      "Pending — waiting for device…",
    );
    expect(screen.getByRole("button", { name: "Set relay 5 ON" })).toBeDisabled();
  });
});

describe("LedControlPage: disabled and hidden controls", () => {
  it("offline: shows the offline text and disables every button", async () => {
    currentState = state({ liveness: "OFFLINE" });
    renderControl(OPERATOR);
    await waitForGrid();
    expect(screen.getByTestId("block-reason")).toHaveTextContent(
      "Device offline — commands disabled",
    );
    for (const b of screen.getAllByRole("button", { name: /^Set relay/ })) {
      expect(b).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "All ON" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "All OFF" })).toBeDisabled();
  });

  it("stale: shows the stale text", async () => {
    currentState = state({ liveness: "STALE" });
    renderControl(TECH);
    await waitForGrid();
    expect(screen.getByTestId("block-reason")).toHaveTextContent(
      "No recent data from device — commands disabled",
    );
  });

  it("AUTO mode: shows the mode text and disables buttons", async () => {
    currentState = state({ mode: "AUTO" });
    renderControl(TECH);
    await waitForGrid();
    expect(screen.getByTestId("block-reason")).toHaveTextContent(
      "Device is in AUTO mode — manual commands are disabled",
    );
    expect(screen.getByRole("button", { name: "Set relay 1 ON" })).toBeDisabled();
  });

  it("MAINTENANCE mode needs DEVICE_DIAGNOSTICS", async () => {
    currentState = state({ mode: "MAINTENANCE" });
    const first = renderControl(TECH);
    await waitForGrid();
    expect(screen.getByTestId("block-reason")).toHaveTextContent(
      "Device is in MAINTENANCE mode — manual commands are disabled",
    );
    first.unmount();
    resetRealtimeForTests();
    sockets.length = 0;

    renderControl([...TECH, "DEVICE_DIAGNOSTICS"]);
    await waitForGrid();
    expect(screen.queryByTestId("block-reason")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set relay 1 ON" })).toBeEnabled();
  });

  it("disables buttons while the live connection is down", async () => {
    renderControl(TECH);
    await waitForGrid();
    expect(screen.getByRole("button", { name: "Set relay 1 ON" })).toBeEnabled();
    act(() => {
      last().connected = false;
      last().trigger("disconnect", "transport close");
    });
    expect(await screen.findByTestId("block-reason")).toHaveTextContent(
      "Live connection lost — commands disabled",
    );
    expect(screen.getByRole("button", { name: "Set relay 1 ON" })).toBeDisabled();
  });

  it("viewer sees the relays but no buttons and no bulk bar", async () => {
    renderControl(["DEVICE_READ"]);
    await waitForGrid();
    expect(screen.getAllByText(/^Logical: /)).toHaveLength(16);
    expect(screen.queryAllByRole("button", { name: /^Set relay/ })).toHaveLength(0);
    expect(screen.queryByTestId("bulk-control-bar")).not.toBeInTheDocument();
  });

  it("technician (no DEVICE_COMMAND_BULK) sees relay buttons but no bulk bar", async () => {
    renderControl(TECH);
    await waitForGrid();
    expect(screen.getAllByRole("button", { name: /^Set relay/ })).toHaveLength(32);
    expect(screen.queryByTestId("bulk-control-bar")).not.toBeInTheDocument();
  });
});

describe("LedControlPage: bulk", () => {
  it("All OFF always asks first; Cancel sends nothing; confirm sends one SET_ALL_RELAYS", async () => {
    renderControl(OPERATOR);
    await waitForGrid();

    fireEvent.click(screen.getByRole("button", { name: "All OFF" }));
    expect(
      screen.getByRole("heading", { name: "Turn ALL 16 relays OFF on LED-01?" }),
    ).toBeInTheDocument();
    expect(posts).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Turn ALL 16 relays OFF on LED-01?")).not.toBeInTheDocument();
    expect(posts).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "All ON" }));
    expect(
      screen.getByRole("heading", { name: "Turn ALL 16 relays ON on LED-01?" }),
    ).toBeInTheDocument();
    postResponse = () =>
      HttpResponse.json(
        envelope(
          command({
            commandId: "22222222-2222-4222-8222-222222222222",
            action: "SET_ALL_RELAYS",
            params: { state: "ON" },
          }),
        ),
        { status: 202 },
      );
    fireEvent.click(screen.getByRole("button", { name: "Turn all ON" }));

    expect(await screen.findByTestId("bulk-pending")).toHaveTextContent(
      "Pending — waiting for device…",
    );
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ action: "SET_ALL_RELAYS", state: "ON" });
    // while a bulk command is in flight every relay button is disabled
    expect(screen.getByRole("button", { name: "Set relay 9 ON" })).toBeDisabled();

    act(() =>
      last().trigger(
        "command:updated",
        env(
          command({
            commandId: "22222222-2222-4222-8222-222222222222",
            action: "SET_ALL_RELAYS",
            params: { state: "ON" },
            status: "EXECUTED",
            completedAt: T2,
          }),
        ),
      ),
    );
    await vi.waitFor(() =>
      expect(screen.queryByTestId("bulk-pending")).not.toBeInTheDocument(),
    );
    expect(
      within(screen.getByTestId("bulk-control-bar")).getByTestId("command-status-pill"),
    ).toHaveTextContent("Done");
  });
});

describe("commandsSlice ordering", () => {
  it("never moves a command back in its lifecycle and keeps the first terminal result", () => {
    let s = commandsReducer(undefined, commandUpdated(command({ status: "PENDING" })));
    s = commandsReducer(s, commandUpdated(command({ status: "EXECUTED" })));
    expect(s.pendingKey["LED-01"]).toEqual({});
    s = commandsReducer(s, commandUpdated(command({ status: "PUBLISHED" })));
    expect(s.byId[command().commandId].status).toBe("EXECUTED");
    expect(s.pendingKey["LED-01"]).toEqual({});
    s = commandsReducer(s, commandUpdated(command({ status: "TIMEOUT" })));
    expect(s.byId[command().commandId].status).toBe("EXECUTED");
  });

  it("a late ack only updates lateResult of a TIMEOUT", () => {
    let s = commandsReducer(undefined, commandUpdated(command({ status: "TIMEOUT" })));
    s = commandsReducer(
      s,
      commandUpdated(command({ status: "TIMEOUT", lateResult: "EXECUTED" })),
    );
    expect(s.byId[command().commandId].lateResult).toBe("EXECUTED");
  });
});
