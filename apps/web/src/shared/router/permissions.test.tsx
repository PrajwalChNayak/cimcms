import type { DeviceListItemDto, DeviceStateDto } from "@cimcms/contracts";
import { ENV } from "@config/env";
import { getNavigationItems } from "@shared/layouts/dashboard/navigationConfig";
import { AppRoutes } from "@shared/router/AppRouter";
import { setSession } from "@store/slices/authSlice";
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

// Role/permission sets from plan section 7.
const VIEWER = {
  roles: ["VIEWER"],
  permissions: ["DEVICE_READ", "AUDIT_READ", "ROOM_READ"],
};
const ADMIN = {
  roles: ["ADMIN"],
  permissions: ["DEVICE_READ", "DEVICE_COMMAND", "DEVICE_COMMAND_BULK", "AUDIT_READ"],
};

const state: DeviceStateDto = {
  deviceId: "LED-01",
  type: "LED_CONTROLLER",
  liveness: "ONLINE",
  lastSeenAt: T0,
  firmwareVersion: "1.0.0",
  bootId: "b1",
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
};
const led: DeviceListItemDto = {
  id: "665f00000000000000000001",
  deviceId: "LED-01",
  name: "LED Controller 1",
  type: "LED_CONTROLLER",
  createdAt: T0,
  updatedAt: T0,
  state,
};
const empty = envelope({
  data: [],
  pagination: { total: 0, page: 1, limit: 20, totalPages: 1 },
});

const renderRoute = (
  route: string,
  who: { roles: string[]; permissions: string[] },
) => {
  const store = createTestStore();
  store.dispatch(
    setSession({
      accessToken: "tok",
      user: makeUser(who.permissions, { roles: who.roles }),
    }),
  );
  return renderWithProviders(
    <Suspense fallback={<p>loading route</p>}>
      <AppRoutes />
    </Suspense>,
    { store, route },
  );
};

afterEach(() => {
  ENV.FF_CIMCMS = false;
});

describe("route permissions", () => {
  it("VIEWER cannot open /users: 403 page, no users page", async () => {
    renderRoute("/users", VIEWER);
    expect(await screen.findByText("Access Forbidden")).toBeInTheDocument();
    expect(screen.getByText("403")).toBeInTheDocument();
  });

  it("a user without AUDIT_READ cannot open /audit", async () => {
    renderRoute("/audit", { roles: ["VIEWER"], permissions: ["DEVICE_READ"] });
    expect(await screen.findByText("Access Forbidden")).toBeInTheDocument();
  });

  it("a user without DEVICE_READ cannot open a device history page", async () => {
    renderRoute("/devices/LED-01/commands", { roles: ["VIEWER"], permissions: [] });
    expect(await screen.findByText("Access Forbidden")).toBeInTheDocument();
  });

  it("a user with AUDIT_READ opens /audit", async () => {
    server.use(http.get(apiUrl("/audit"), () => HttpResponse.json(empty)));
    renderRoute("/audit", VIEWER);
    expect(await screen.findByRole("heading", { name: "Audit log" })).toBeInTheDocument();
    expect(screen.queryByText("Access Forbidden")).not.toBeInTheDocument();
  });

  it("VIEWER sees the relays but no command controls on the control page", async () => {
    server.use(
      http.get(apiUrl("/devices"), () =>
        HttpResponse.json(
          envelope({
            data: [led],
            pagination: { total: 1, page: 1, limit: 100, totalPages: 1 },
          }),
        ),
      ),
      http.get(apiUrl(`/devices/${led.id}/state`), () =>
        HttpResponse.json(envelope(state)),
      ),
      http.get(apiUrl(`/devices/${led.id}/relay-changes`), () =>
        HttpResponse.json(empty),
      ),
      http.get(apiUrl(`/devices/${led.id}/commands`), () =>
        HttpResponse.json(empty),
      ),
    );
    renderRoute("/devices/LED-01/control", VIEWER);
    expect(await screen.findByTestId("relay-grid")).toBeInTheDocument();
    expect(screen.getAllByText("Logical: OFF")).toHaveLength(16);
    expect(screen.queryAllByRole("button", { name: /^Set relay/ })).toHaveLength(0);
    expect(screen.queryByTestId("bulk-control-bar")).not.toBeInTheDocument();
  });
});

describe("navigation", () => {
  const labels = (items: ReturnType<typeof getNavigationItems>) =>
    items.map((i) => i.label);

  it("VIEWER menu: Dashboard, Devices, Rooms, Audit, Settings (no Users)", () => {
    expect(
      labels(getNavigationItems({ ...VIEWER, cimcms: true })),
    ).toEqual(["Dashboard", "Devices", "Rooms", "Audit", "Settings"]);
  });

  it("ADMIN menu adds Users", () => {
    expect(labels(getNavigationItems({ ...ADMIN, cimcms: true }))).toEqual([
      "Dashboard",
      "Devices",
      "Audit",
      "Users",
      "Settings",
    ]);
  });

  it("farm / consumer entries are hidden only when VITE_FF_CIMCMS=true", () => {
    const off = labels(getNavigationItems({ ...ADMIN, cimcms: false }));
    expect(off).toContain("Farms");
    expect(off).toContain("MasterTypeConstant");
    const on = labels(getNavigationItems({ ...ADMIN, cimcms: true }));
    expect(on).not.toContain("Farms");
    expect(on).not.toContain("MasterTypeConstant");
  });

  it("the rendered sidebar follows the signed-in user", async () => {
    ENV.FF_CIMCMS = true;
    server.use(http.get(apiUrl("/audit"), () => HttpResponse.json(empty)));
    renderRoute("/audit", VIEWER);
    await screen.findByRole("heading", { name: "Audit log" });
    // desktop sidebar + mobile drawer both render the menu
    const sidebars = screen.getAllByRole("complementary");
    for (const sidebar of sidebars) {
      const nav = within(sidebar);
      expect(nav.getByRole("button", { name: /Devices/ })).toBeInTheDocument();
      expect(nav.getByRole("button", { name: /Audit/ })).toBeInTheDocument();
      expect(nav.queryByRole("button", { name: /Users/ })).not.toBeInTheDocument();
      expect(nav.queryByRole("button", { name: /Farms/ })).not.toBeInTheDocument();
    }
  });
});
