import type {
  AuditLogDto,
  CommandDto,
  DeviceEventDto,
  DeviceListItemDto,
} from "@cimcms/contracts";
import {
  istDateEndToUtcIso,
  istDateStartToUtcIso,
  formatDuration,
} from "@shared/utils/time";
import { setSession } from "@store/slices/authSlice";
import { AuditPage } from "@view/history/AuditPage";
import { DeviceCommandsPage } from "@view/history/DeviceCommandsPage";
import { DeviceEventsPage } from "@view/history/DeviceEventsPage";
import { fireEvent, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiUrl, envelope } from "../../test/apiUrl";
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
const led: DeviceListItemDto = {
  id: "665f0000-0000-4000-8000-000000000001",
  deviceId: "LED-01",
  name: "LED Controller 1",
  type: "LED_CONTROLLER",
  createdAt: T0,
  updatedAt: T0,
  state: null,
};

const cmd = (n: number, over: Partial<CommandDto> = {}): CommandDto => ({
  commandId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  deviceId: "LED-01",
  action: "SET_RELAY",
  params: { relay: 2, state: "ON" },
  source: "web",
  status: "EXECUTED",
  reason: null,
  lateResult: null,
  issuedBy: { id: "u1", email: "op@example.test" },
  issuedAt: "2026-11-21T10:00:00.000Z",
  expiresAt: "2026-11-21T10:00:15.000Z",
  publishedAt: null,
  completedAt: "2026-11-21T10:00:01.250Z",
  acks: [],
  simulation: true,
  ...over,
});

const pageOf = <T,>(data: T[], page: number, limit: number, total: number) =>
  envelope({
    data,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });

let requests: URLSearchParams[];
beforeEach(() => {
  requests = [];
  server.use(
    http.get(apiUrl("/devices"), () =>
      HttpResponse.json(pageOf([led], 1, 100, 1)),
    ),
  );
});
const lastQuery = () => requests[requests.length - 1];

const render = (
  path: string,
  element: React.ReactElement,
  route: string,
  permissions = ["DEVICE_READ", "AUDIT_READ"],
) => {
  const store = createTestStore();
  store.dispatch(setSession({ accessToken: "tok", user: makeUser(permissions) }));
  return renderWithProviders(
    <Routes>
      <Route path={path} element={element} />
    </Routes>,
    { store, route },
  );
};

describe("time helpers", () => {
  it("converts an IST calendar day to UTC ISO bounds", () => {
    expect(istDateStartToUtcIso("2026-11-20")).toBe("2026-11-19T18:30:00.000Z");
    expect(istDateEndToUtcIso("2026-11-20")).toBe("2026-11-20T18:29:59.999Z");
    expect(istDateStartToUtcIso("")).toBeUndefined();
    expect(istDateStartToUtcIso("20-11-2026")).toBeUndefined();
  });
  it("formats a duration", () => {
    expect(formatDuration("2026-11-21T10:00:00.000Z", "2026-11-21T10:00:00.850Z")).toBe("850 ms");
    expect(formatDuration("2026-11-21T10:00:00.000Z", "2026-11-21T10:00:01.250Z")).toBe("1.3 s");
    expect(formatDuration("2026-11-21T10:00:00.000Z", null)).toBe("—");
  });
});

describe("DeviceCommandsPage", () => {
  const useCommands = (total = 45) => {
    server.use(
      http.get(apiUrl(`/devices/${led.id}/commands`), ({ request }) => {
        const q = new URL(request.url).searchParams;
        requests.push(q);
        const page = Number(q.get("page") ?? 1);
        const status = q.get("status");
        const rows =
          status === "TIMEOUT"
            ? [cmd(90, { status: "TIMEOUT", completedAt: null, params: { relay: 7, state: "OFF" } })]
            : page === 2
              ? [cmd(21, { params: { relay: 9, state: "ON" } })]
              : [
                  cmd(1, {
                    status: "REJECTED",
                    reason: "INVALID_RELAY",
                    params: { relay: 2, state: "ON" },
                  }),
                  cmd(2, { action: "SET_ALL_RELAYS", params: { state: "OFF" } }),
                ];
        return HttpResponse.json(
          pageOf(rows, page, 20, status === "TIMEOUT" ? 1 : total),
        );
      }),
    );
  };

  const open = (search = "") =>
    render(
      "/devices/:deviceId/commands",
      <DeviceCommandsPage />,
      `/devices/LED-01/commands${search}`,
    );

  it("shows time (IST), user, action, relay, requested state, status, reason and latency", async () => {
    useCommands();
    open();
    await screen.findAllByText("op@example.test");
    const rows = screen.getAllByRole("row");
    const first = within(rows[1]);
    expect(first.getByText("op@example.test")).toBeInTheDocument();
    expect(first.getByText("SET_RELAY")).toBeInTheDocument();
    expect(first.getByText("ON")).toBeInTheDocument();
    expect(first.getByText("Rejected: INVALID_RELAY")).toBeInTheDocument();
    expect(first.getByText("INVALID_RELAY")).toBeInTheDocument();
    expect(first.getByText("1.3 s")).toBeInTheDocument();
    expect(first.getByText(/21 Nov 2026/)).toBeInTheDocument();
    const second = within(rows[2]);
    expect(second.getByText("SET_ALL_RELAYS")).toBeInTheDocument();
    expect(second.getByText("All")).toBeInTheDocument();
    expect(second.getByText("Done")).toBeInTheDocument();
    expect(lastQuery().get("page")).toBe("1");
    expect(lastQuery().get("limit")).toBe("20");
    expect(lastQuery().has("status")).toBe(false);
  });

  it("filters by status only after Apply and resets with Reset", async () => {
    useCommands();
    open();
    await screen.findByText("SET_ALL_RELAYS");
    const before = requests.length;

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "TIMEOUT" } });
    expect(requests).toHaveLength(before); // nothing sent before Apply
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByText("No reply from device")).toBeInTheDocument();
    expect(lastQuery().get("status")).toBe("TIMEOUT");
    expect(screen.queryByText("SET_ALL_RELAYS")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(await screen.findByText("SET_ALL_RELAYS")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toHaveValue("");
  });

  it("paginates: Next requests page 2, and a new filter returns to page 1", async () => {
    useCommands(45);
    open();
    expect(await screen.findByText(/of/)).toHaveTextContent("Showing 1–20 of 45 results");

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("9")).toBeInTheDocument();
    expect(lastQuery().get("page")).toBe("2");
    expect(screen.getByText(/of/)).toHaveTextContent("Showing 21–40 of 45 results");

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "TIMEOUT" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText("No reply from device");
    expect(lastQuery().get("page")).toBe("1");
  });

  it("starts on the page given in the URL", async () => {
    useCommands(45);
    open("?page=2");
    await screen.findByText("9");
    expect(lastQuery().get("page")).toBe("2");
  });

  it("a bad page value falls back to page 1", async () => {
    useCommands(45);
    open("?page=abc");
    await screen.findByText("SET_ALL_RELAYS");
    expect(lastQuery().get("page")).toBe("1");
  });
});

describe("DeviceEventsPage", () => {
  const ev = (id: string, type: DeviceEventDto["type"]): DeviceEventDto => ({
    id,
    deviceId: "LED-01",
    type,
    origin: "DEVICE",
    data: { relay: 3 },
    deviceTs: null,
    receivedAt: T0,
  });

  beforeEach(() => {
    server.use(
      http.get(apiUrl(`/devices/${led.id}/events`), ({ request }) => {
        const q = new URL(request.url).searchParams;
        requests.push(q);
        const page = Number(q.get("page") ?? 1);
        return HttpResponse.json(
          pageOf(page === 2 ? [ev("e21", "MQTT")] : [ev("e1", "BOOT"), ev("e2", "KEYPAD")], page, 20, 25),
        );
      }),
    );
  });

  const open = () =>
    render("/devices/:deviceId/events", <DeviceEventsPage />, "/devices/LED-01/events");

  it("lists events and filters by type and IST date range (sent as UTC ISO)", async () => {
    open();
    expect(await screen.findByText("BOOT", { selector: "td" })).toBeInTheDocument();
    expect(screen.getAllByText("relay: 3", { selector: "td" }).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "KEYPAD" } });
    fireEvent.change(screen.getByLabelText("From (IST date)"), { target: { value: "2026-11-20" } });
    fireEvent.change(screen.getByLabelText("To (IST date)"), { target: { value: "2026-11-21" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await vi.waitFor(() => expect(lastQuery().get("type")).toBe("KEYPAD"));
    expect(lastQuery().get("from")).toBe("2026-11-19T18:30:00.000Z");
    expect(lastQuery().get("to")).toBe("2026-11-21T18:29:59.999Z");
    expect(lastQuery().get("page")).toBe("1");
  });

  it("paginates", async () => {
    open();
    await screen.findByText("BOOT", { selector: "td" });
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("MQTT", { selector: "td" })).toBeInTheDocument();
    expect(lastQuery().get("page")).toBe("2");
  });
});

describe("AuditPage", () => {
  const audit = (id: string, action: string): AuditLogDto => ({
    id,
    actorId: "u1",
    actorEmail: "admin@example.test",
    actorType: "USER",
    action,
    entity: "Command",
    entityId: "c1",
    data: { action: "SET_RELAY" },
    ip: null,
    requestId: null,
    at: T0,
  });

  beforeEach(() => {
    server.use(
      http.get(apiUrl("/audit"), ({ request }) => {
        const q = new URL(request.url).searchParams;
        requests.push(q);
        const page = Number(q.get("page") ?? 1);
        return HttpResponse.json(
          pageOf(
            [audit(`a${page}`, page === 2 ? "LOGIN" : "COMMAND_SUBMITTED")],
            page,
            20,
            30,
          ),
        );
      }),
    );
  });

  const open = () => render("/audit", <AuditPage />, "/audit");

  it("shows actor, action and entity, and applies filters", async () => {
    open();
    expect(await screen.findByText("COMMAND_SUBMITTED")).toBeInTheDocument();
    expect(screen.getByText("admin@example.test")).toBeInTheDocument();
    expect(screen.getByText("Command c1")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Action"), { target: { value: " COMMAND_SUBMITTED " } });
    fireEvent.change(screen.getByLabelText("Entity"), { target: { value: "Command" } });
    fireEvent.change(screen.getByLabelText("From (IST date)"), { target: { value: "2026-11-21" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await vi.waitFor(() => expect(lastQuery().get("action")).toBe("COMMAND_SUBMITTED"));
    expect(lastQuery().get("entity")).toBe("Command");
    expect(lastQuery().get("from")).toBe("2026-11-20T18:30:00.000Z");
    expect(lastQuery().has("to")).toBe(false);
  });

  it("paginates", async () => {
    open();
    await screen.findByText("COMMAND_SUBMITTED");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("LOGIN")).toBeInTheDocument();
    expect(lastQuery().get("page")).toBe("2");
  });
});
