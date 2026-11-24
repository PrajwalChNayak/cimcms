import type { DeviceListItemDto, MqttAccountDto, MqttCredentialsDto } from "@cimcms/contracts";
import { DevicesPage } from "@view/devices/DevicesPage";
import { DeviceDetailPage } from "@view/devices/DeviceDetailPage";
import { connectRealtime, resetRealtimeForTests, type RealtimeStore } from "@shared/realtime/socketClient";
import { formatIst } from "@shared/utils/time";
import { setSession } from "@store/slices/authSlice";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
vi.mock("@shared/components/ui/LineChart", () => ({ LineChart: () => <div /> }));

const T0 = "2026-11-21T10:00:00.000Z";
const T1 = "2026-11-23T09:30:00.000Z";
const BROKER = "mqtts://broker.example.test:8883";
const fresh: DeviceListItemDto = {
  id: "665f0000-0000-4000-8000-000000000009",
  deviceId: "LED-02",
  name: "LED-02",
  type: "LED_CONTROLLER",
  createdAt: T0,
  updatedAt: T0,
  state: null,
};

const topicsOf = (deviceId: string) => {
  const base = `cimcms/led/${deviceId}`;
  return {
    base,
    publish: ["status", "telemetry", "ack", "event"].map((k) => `${base}/${k}`),
    subscribe: ["command", "config"].map((k) => `${base}/${k}`),
  };
};
const credentialsFor = (deviceId: string, password: string): MqttCredentialsDto => ({
  username: deviceId,
  clientId: deviceId,
  password,
  brokerUrl: BROKER,
  topics: topicsOf(deviceId),
});

/** DeviceDto part of a list item (what POST /devices/register returns as `device`). */
const deviceDto = ({ id, deviceId, name, type, createdAt, updatedAt }: DeviceListItemDto) => ({
  id, deviceId, name, type, createdAt, updatedAt,
});

/** How the fake server creates broker accounts on register. */
let provisioning: "broker" | "manual" | "failed";
let account: MqttAccountDto;
let resetStatus: 200 | 502;
let devices: DeviceListItemDto[];
let registerBodies: unknown[];
let updateBodies: unknown[];
let accountRequests: number;
let resetCalls: number;

beforeEach(() => {
  sockets.length = 0;
  devices = [];
  registerBodies = [];
  updateBodies = [];
  accountRequests = 0;
  resetCalls = 0;
  provisioning = "broker";
  resetStatus = 200;
  account = {
    provisioning: "broker",
    exists: true,
    username: "LED-02",
    clientId: "LED-02",
    createdAt: T0,
    passwordSetAt: T0,
    brokerUrl: BROKER,
    topics: topicsOf("LED-02"),
  };
  server.use(
    http.get(apiUrl("/devices"), () =>
      HttpResponse.json(
        envelope({ data: devices, pagination: { total: devices.length, page: 1, limit: 100, totalPages: 1 } }),
      ),
    ),
    http.post(apiUrl("/devices/register"), async ({ request }) => {
      const body = (await request.json()) as { deviceId: string; deviceType: "LED_CONTROLLER"; name?: string };
      registerBodies.push(body);
      if (body.deviceId === "LED-01") {
        return HttpResponse.json(
          { statusCode: 409, message: "The value for 'deviceId' already exists. This field must be unique.", errorCode: "PRISMA_P2002" },
          { status: 409 },
        );
      }
      const device = { ...fresh, deviceId: body.deviceId, name: body.name ?? body.deviceId, type: body.deviceType };
      devices = [...devices, device];
      return HttpResponse.json(
        envelope({
          device: deviceDto(device),
          provisioning: provisioning === "manual" ? "manual" : "broker",
          credentials: provisioning === "broker" ? credentialsFor(body.deviceId, "first-secret-pass") : null,
          provisioningError:
            provisioning === "failed" ? "The broker account could not be changed: broker timeout" : null,
        }),
        { status: 201 },
      );
    }),
    http.put(apiUrl(`/devices/${fresh.id}`), async ({ request }) => {
      const body = (await request.json()) as { name?: string; location?: string };
      updateBodies.push(body);
      devices = devices.map((d) => (d.id === fresh.id ? { ...d, ...body } : d));
      return HttpResponse.json(envelope({ id: fresh.id, deviceId: "LED-02" }));
    }),
    http.get(apiUrl(`/devices/${fresh.id}/mqtt-account`), () => {
      accountRequests += 1;
      return HttpResponse.json(envelope(account));
    }),
    http.post(apiUrl(`/devices/${fresh.id}/mqtt-account/password`), () => {
      if (account.provisioning === "manual") {
        return HttpResponse.json(
          { statusCode: 409, message: "Automatic broker accounts are not enabled.", errorCode: "MQTT_PROVISIONING_DISABLED" },
          { status: 409 },
        );
      }
      if (resetStatus === 502) {
        return HttpResponse.json(
          { statusCode: 502, message: "The broker account could not be changed: connection refused", errorCode: "MQTT_PROVISIONING_FAILED" },
          { status: 502 },
        );
      }
      resetCalls += 1;
      account = { ...account, exists: true, createdAt: account.createdAt ?? T1, passwordSetAt: T1 };
      return HttpResponse.json(envelope(credentialsFor("LED-02", `new-secret-${resetCalls}`)));
    }),
    http.get(apiUrl(`/devices/${fresh.id}/state`), () =>
      HttpResponse.json(
        envelope({
          deviceId: "LED-02", type: "LED_CONTROLLER", liveness: "UNKNOWN", lastSeenAt: null, firmwareVersion: null,
          bootId: null, mode: null, modeStatus: null, simulationMode: null, relayStates: [], relayOnCount: 0,
          connectivity: null, rtc: null, configVersion: null, autoReady: null, updatedAt: T0,
        }),
      ),
    ),
    http.get(apiUrl(`/devices/${fresh.id}/events`), () =>
      HttpResponse.json(envelope({ data: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 0 } })),
    ),
    http.get(apiUrl(`/devices/${fresh.id}/telemetry`), () => HttpResponse.json(envelope([]))),
  );
});
afterEach(() => resetRealtimeForTests());

/** userEvent.setup() installs its own clipboard stub; replace it with a spy afterwards. */
const mockClipboard = () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
};

const renderList = (permissions: string[]) => {
  const store = createTestStore();
  store.dispatch(setSession({ accessToken: "tok", user: makeUser(permissions) }));
  connectRealtime(store as unknown as RealtimeStore);
  return renderWithProviders(<DevicesPage />, { store });
};

const renderDetail = (permissions: string[]) => {
  devices = [{ ...fresh, name: "Room A lights" }];
  const store = createTestStore();
  store.dispatch(setSession({ accessToken: "tok", user: makeUser(permissions) }));
  connectRealtime(store as unknown as RealtimeStore);
  renderWithProviders(
    <Routes>
      <Route path="/devices/:deviceId" element={<DeviceDetailPage />} />
    </Routes>,
    { store, route: "/devices/LED-02" },
  );
};

const MANAGER = ["DEVICE_READ", "DEVICE_MANAGE"];

/** Opens the Add dialog and submits a valid device. */
const addDevice = async (user: ReturnType<typeof userEvent.setup>, deviceId = "LED-02") => {
  await user.click(await screen.findByRole("button", { name: "Add device" }));
  const dialog = screen.getByRole("dialog");
  await user.type(within(dialog).getByLabelText("Device ID"), deviceId);
  await user.click(within(dialog).getByRole("button", { name: "Add device" }));
  expect(await screen.findByText("Device added")).toBeInTheDocument();
  return screen.getByRole("dialog");
};

describe("Add device", () => {
  it("is hidden without DEVICE_MANAGE", async () => {
    renderList(["DEVICE_READ"]);
    await screen.findByText("No devices found.");
    expect(screen.queryByRole("button", { name: "Add device" })).not.toBeInTheDocument();
  });

  it("validates the id, registers the device, shows the one-time broker login and lists it", async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    renderList(MANAGER);
    await user.click(await screen.findByRole("button", { name: "Add device" }));
    const dialog = screen.getByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "Add device" });

    await user.type(within(dialog).getByLabelText("Device ID"), "x");
    expect(within(dialog).getByText(/3–40 characters/)).toBeInTheDocument();
    expect(submit).toBeDisabled();

    await user.clear(within(dialog).getByLabelText("Device ID"));
    await user.type(within(dialog).getByLabelText("Device ID"), "LED-02");
    await user.type(within(dialog).getByLabelText("Name"), "Room A lights");
    // Planned types cannot be picked.
    expect(within(dialog).getByRole("option", { name: /Steam Generator \(planned\)/ })).toBeDisabled();
    await user.click(submit);

    expect(await screen.findByText("Device added")).toBeInTheDocument();
    expect(registerBodies).toEqual([{ deviceId: "LED-02", deviceType: "LED_CONTROLLER", name: "Room A lights" }]);
    const panel = screen.getByTestId("mqtt-credentials");
    expect(panel).toHaveTextContent(BROKER);
    expect(panel).toHaveTextContent("cimcms/led/LED-02/command");
    expect(panel).toHaveTextContent("cimcms/led/LED-02/telemetry");
    expect(panel).toHaveTextContent(/shown only once and cannot be recovered/);
    expect(panel).toHaveTextContent(/Keep relay simulation ON/);

    // Masked until asked.
    expect(within(panel).queryByText("first-secret-pass")).not.toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Show" }));
    expect(within(panel).getByTestId("mqtt-password")).toHaveTextContent("first-secret-pass");
    await user.click(within(panel).getByRole("button", { name: "Hide" }));
    expect(within(panel).queryByText("first-secret-pass")).not.toBeInTheDocument();

    const copyPassword = within(panel).getByRole("button", { name: "Copy password" });
    await user.click(copyPassword);
    expect(writeText).toHaveBeenCalledWith("first-secret-pass");
    expect(copyPassword).toHaveTextContent("Copied");
    await user.click(within(panel).getByRole("button", { name: "Copy username" }));
    expect(writeText).toHaveBeenLastCalledWith("LED-02");
    await user.click(within(panel).getByRole("button", { name: "Copy broker address" }));
    expect(writeText).toHaveBeenLastCalledWith(BROKER);

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByTestId("device-card-LED-02")).toBeInTheDocument();
    expect(screen.queryByText("first-secret-pass")).not.toBeInTheDocument();
  });

  it("says when the broker address is not configured", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl("/devices/register"), () =>
        HttpResponse.json(
          envelope({
            device: deviceDto(fresh),
            provisioning: "broker",
            credentials: { ...credentialsFor("LED-02", "pw"), brokerUrl: null },
            provisioningError: null,
          }),
          { status: 201 },
        ),
      ),
    );
    renderList(MANAGER);
    const dialog = await addDevice(user);
    expect(within(dialog).getByText("Broker address not configured — ask the server admin")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Copy broker address" })).not.toBeInTheDocument();
  });

  it("shows the manual broker steps when accounts are created by hand", async () => {
    const user = userEvent.setup();
    provisioning = "manual";
    renderList(MANAGER);
    const dialog = await addDevice(user);
    expect(within(dialog).getByText("1. Broker account (external broker admin)")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("cimcms/led/LED-02/command");
    expect(within(dialog).queryByTestId("mqtt-credentials")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("shows a failed account creation and creates it on Try again", async () => {
    const user = userEvent.setup();
    provisioning = "failed";
    account = { ...account, exists: false, createdAt: null, passwordSetAt: null };
    renderList(MANAGER);
    const dialog = await addDevice(user);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("broker timeout");
    expect(within(dialog).queryByTestId("mqtt-credentials")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Try again" }));
    const panel = await within(dialog).findByTestId("mqtt-credentials");
    expect(resetCalls).toBe(1);
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(panel).queryByText("new-secret-1")).not.toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Show" }));
    expect(within(panel).getByTestId("mqtt-password")).toHaveTextContent("new-secret-1");
  });

  it("shows the server error for a duplicate id", async () => {
    const user = userEvent.setup();
    renderList(MANAGER);
    await user.click(await screen.findByRole("button", { name: "Add device" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Device ID"), "LED-01");
    await user.click(within(dialog).getByRole("button", { name: "Add device" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/already exists/);
  });
});

describe("Edit device", () => {
  it("shows the setup steps while the controller has never connected", async () => {
    renderDetail(["DEVICE_READ"]);
    expect(await screen.findByText("Waiting for the controller")).toBeInTheDocument();
    expect(screen.getByText("1. Broker account (external broker admin)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("changes name and location with DEVICE_MANAGE", async () => {
    const user = userEvent.setup();
    renderDetail(MANAGER);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");
    const name = within(dialog).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Room B lights");
    await user.type(within(dialog).getByLabelText("Location"), "Grow room B");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("heading", { name: "Room B lights" })).toBeInTheDocument();
    expect(updateBodies).toEqual([{ name: "Room B lights", location: "Grow room B" }]);
  });
});

describe("Broker account card", () => {
  it("is hidden and not requested without DEVICE_MANAGE", async () => {
    renderDetail(["DEVICE_READ"]);
    expect(await screen.findByText("Waiting for the controller")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Broker account" })).not.toBeInTheDocument();
    expect(accountRequests).toBe(0);
  });

  it("shows the account to managers and the waiting card points to it", async () => {
    renderDetail(MANAGER);
    const card = await screen.findByTestId("broker-account");
    expect(screen.getByRole("heading", { name: "Broker account" })).toBeInTheDocument();
    expect(card).toHaveTextContent("Automatic (CIMCMS broker)");
    expect(card).toHaveTextContent("Exists");
    expect(card).toHaveTextContent("LED-02");
    expect(card).toHaveTextContent(BROKER);
    expect(card).toHaveTextContent(formatIst(T0));
    expect(card).toHaveTextContent("cimcms/led/LED-02/…");
    expect(screen.getByText(/has not connected yet/)).toBeInTheDocument();
    // The manual steps are not repeated for managers.
    expect(screen.queryByText("1. Broker account (external broker admin)")).not.toBeInTheDocument();
  });

  it("resets the password after a confirmation and shows the new one once", async () => {
    const user = userEvent.setup();
    renderDetail(MANAGER);
    await screen.findByTestId("broker-account");

    // Cancel does nothing.
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(resetCalls).toBe(0);

    await user.click(screen.getByRole("button", { name: "Reset password" }));
    const confirm = screen.getByRole("dialog");
    expect(confirm).toHaveTextContent("The device is disconnected until it uses the new password.");
    await user.click(within(confirm).getByRole("button", { name: "Reset password" }));

    const panel = await screen.findByTestId("mqtt-credentials");
    expect(resetCalls).toBe(1);
    expect(within(panel).queryByText("new-secret-1")).not.toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Show" }));
    expect(within(panel).getByTestId("mqtt-password")).toHaveTextContent("new-secret-1");

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByTestId("mqtt-credentials")).not.toBeInTheDocument();
    expect(screen.queryByText("new-secret-1")).not.toBeInTheDocument();
    // The account is reloaded with the new password time.
    await waitFor(() => expect(screen.getByTestId("broker-account")).toHaveTextContent(formatIst(T1)));
  });

  it("offers Create account when the account is missing", async () => {
    const user = userEvent.setup();
    account = { ...account, exists: false, createdAt: null, passwordSetAt: null };
    renderDetail(MANAGER);
    expect(await screen.findByTestId("broker-account")).toHaveTextContent("Missing");
    expect(screen.queryByRole("button", { name: "Reset password" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create account" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create account" }));
    expect(await screen.findByTestId("mqtt-credentials")).toBeInTheDocument();
    expect(resetCalls).toBe(1);
  });

  it("shows a broker failure on reset", async () => {
    const user = userEvent.setup();
    resetStatus = 502;
    renderDetail(MANAGER);
    await screen.findByTestId("broker-account");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reset password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("connection refused");
    expect(screen.queryByTestId("mqtt-credentials")).not.toBeInTheDocument();
  });

  it("shows the manual steps and no reset button in manual mode", async () => {
    account = { ...account, provisioning: "manual", exists: false, createdAt: null, passwordSetAt: null };
    renderDetail(MANAGER);
    const card = await screen.findByTestId("broker-account");
    expect(card).toHaveTextContent("Manual (external broker)");
    expect(card).toHaveTextContent("Managed on the external broker");
    expect(screen.getByText("1. Broker account (external broker admin)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset password" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create account" })).not.toBeInTheDocument();
  });
});
