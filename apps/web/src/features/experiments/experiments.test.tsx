import type {
  ExperimentActionResultDto,
  ExperimentDeviceStatusDto,
  ExperimentDto,
  ExperimentLogEntryDto,
} from "@cimcms/contracts";
import {
  connectRealtime,
  resetRealtimeForTests,
  type RealtimeStore,
} from "@shared/realtime/socketClient";
import { istLocalToUtcIso, utcIsoToIstLocal } from "@shared/utils/time";
import { setSession } from "@store/slices/authSlice";
import { ExperimentPage } from "@view/experiments/ExperimentPage";
import { ExperimentsPage } from "@view/experiments/ExperimentsPage";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
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
const ALL = [1, 2, 3, 4, 5, 6, 7];
const FUTURE_START = "2099-01-01T00:00:00.000Z";
const FUTURE_END = "2099-01-08T00:00:00.000Z";

const experiment = (over: Partial<ExperimentDto> = {}): ExperimentDto => ({
  id: "665f000000000000000000e1",
  code: "EXP-1",
  title: "Light spectrum trial",
  description: null,
  status: "DRAFT",
  startsAt: FUTURE_START,
  endsAt: FUTURE_END,
  createdByEmail: "op@example.test",
  assignments: [
    { groupLabel: "Control", deviceId: "LED-01", relay: 3, windows: [{ days: ALL, on: "06:00", off: "18:00" }] },
  ],
  createdAt: T0,
  updatedAt: T0,
  ...over,
});

const devicesStatus = (over: Partial<ExperimentDeviceStatusDto> = {}): ExperimentDeviceStatusDto[] => [
  {
    deviceId: "LED-01",
    relays: [3],
    liveness: "ONLINE",
    mode: "MANUAL",
    config: null,
    carriesExperiment: false,
    ...over,
  },
];

const action = (exp: ExperimentDto, over: Partial<ExperimentActionResultDto> = {}): ExperimentActionResultDto => ({
  experiment: exp,
  configs: [],
  commandIds: [],
  warnings: [],
  ...over,
});

const page = <T,>(data: T[]) => ({
  data,
  pagination: { total: data.length, page: 1, limit: 100, totalPages: 1 },
});

let current: ExperimentDto;
let deviceRows: ExperimentDeviceStatusDto[];
let logRows: ExperimentLogEntryDto[];
let calls: Array<{ method: string; url: string; body: unknown }>;

beforeEach(() => {
  sockets.length = 0;
  current = experiment();
  deviceRows = devicesStatus();
  logRows = [];
  calls = [];
  const id = current.id;
  server.use(
    http.get(apiUrl("/devices"), () =>
      HttpResponse.json(
        envelope(
          page([
            { id: "665f00000000000000000001", deviceId: "LED-01", name: "LED 1", type: "LED_CONTROLLER", createdAt: T0, updatedAt: T0, state: null },
            { id: "665f00000000000000000002", deviceId: "HUM-01", name: "Hum", type: "HUMIDIFIER", createdAt: T0, updatedAt: T0, state: null },
          ]),
        ),
      ),
    ),
    http.get(apiUrl("/experiments"), () => HttpResponse.json(envelope(page([current])))),
    http.get(apiUrl(`/experiments/${id}`), () => HttpResponse.json(envelope(current))),
    http.get(apiUrl(`/experiments/${id}/devices`), () => HttpResponse.json(envelope(deviceRows))),
    http.get(apiUrl(`/experiments/${id}/events`), () => HttpResponse.json(envelope(logRows))),
  );
});
afterEach(() => resetRealtimeForTests());

const last = () => sockets[sockets.length - 1];

const WRITER = ["EXPERIMENT_READ", "EXPERIMENT_WRITE", "DEVICE_READ"];
const RUNNER = [...WRITER, "EXPERIMENT_RUN"];

const renderRoutes = (permissions: string[], route: string) => {
  const store = createTestStore();
  store.dispatch(setSession({ accessToken: "tok", user: makeUser(permissions, { roles: ["OPERATOR"] }) }));
  connectRealtime(store as unknown as RealtimeStore);
  const view = renderWithProviders(
    <Routes>
      <Route path="/experiments" element={<ExperimentsPage />} />
      <Route path="/experiments/new" element={<ExperimentPage />} />
      <Route path="/experiments/:experimentId" element={<ExperimentPage />} />
    </Routes>,
    { store, route },
  );
  act(() => last().serverConnects());
  return { store, ...view };
};

const recordAction = (name: string, next: () => ExperimentDto) =>
  server.use(
    http.post(apiUrl(`/experiments/${current.id}/${name}`), () => {
      calls.push({ method: "POST", url: name, body: null });
      const exp = next();
      current = exp;
      return HttpResponse.json(envelope(action(exp)));
    }),
  );

const clickConfirm = (label: string) => {
  const buttons = screen.getAllByRole("button", { name: label });
  fireEvent.click(buttons[buttons.length - 1] as HTMLElement);
};

describe("IST helpers", () => {
  it("converts datetime-local values between IST and UTC", () => {
    expect(istLocalToUtcIso("2026-11-22T06:00")).toBe("2026-11-22T00:30:00.000Z");
    expect(utcIsoToIstLocal("2026-11-22T00:30:00.000Z")).toBe("2026-11-22T06:00");
    expect(istLocalToUtcIso("")).toBeUndefined();
    expect(utcIsoToIstLocal(null)).toBe("");
  });
});

describe("ExperimentsPage", () => {
  it("lists experiments with status and shows the create link only with EXPERIMENT_WRITE", async () => {
    const { unmount } = renderRoutes(WRITER, "/experiments");
    expect(await screen.findByTestId("experiment-row-EXP-1")).toHaveTextContent("Draft");
    expect(screen.getByRole("link", { name: "Create experiment" })).toBeInTheDocument();
    unmount();
    renderRoutes(["EXPERIMENT_READ"], "/experiments");
    await screen.findByTestId("experiment-row-EXP-1");
    expect(screen.queryByRole("link", { name: "Create experiment" })).not.toBeInTheDocument();
  });
});

describe("ExperimentPage editor", () => {
  it("validates groups, devices, dates and windows before saving", async () => {
    renderRoutes(WRITER, "/experiments/new");
    const save = await screen.findByRole("button", { name: "Save draft" });
    expect(save).toBeDisabled();
    const messages = () => screen.getByTestId("validation-messages").textContent ?? "";
    expect(messages()).toContain("Enter a code");
    expect(messages()).toContain("Enter a title.");
    expect(messages()).toContain("Enter the start date and time.");
    expect(messages()).toContain("Row 1: enter a group label.");
    expect(messages()).toContain("Row 1: choose a device.");

    fireEvent.change(screen.getByLabelText("Experiment code"), { target: { value: "EXP-9" } });
    fireEvent.change(screen.getByLabelText("Experiment title"), { target: { value: "Blue vs red" } });
    fireEvent.change(screen.getByLabelText("Starts at"), { target: { value: "2099-02-01T06:00" } });
    fireEvent.change(screen.getByLabelText("Ends at"), { target: { value: "2099-01-01T06:00" } });
    expect(messages()).toContain("The end must be after the start.");
    fireEvent.change(screen.getByLabelText("Ends at"), { target: { value: "2099-02-08T06:00" } });
    fireEvent.change(screen.getByLabelText("Row 1 group"), { target: { value: "Control" } });
    // only devices with relay channels are offered
    const select = screen.getByLabelText("Row 1 device") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["", "LED-01"]);
    fireEvent.change(select, { target: { value: "LED-01" } });
    expect(screen.queryByTestId("validation-messages")).not.toBeInTheDocument();
    expect(save).toBeEnabled();

    // the same relay twice, and overlapping windows in one row
    fireEvent.click(screen.getByRole("button", { name: "Add relay" }));
    fireEvent.change(screen.getByLabelText("Row 2 group"), { target: { value: "Blue" } });
    fireEvent.change(screen.getByLabelText("Row 2 device"), { target: { value: "LED-01" } });
    fireEvent.change(screen.getByLabelText("Row 2 relay"), { target: { value: "1" } });
    expect(messages()).toContain("Row 2: relay 1 of LED-01 is used twice.");
    fireEvent.change(screen.getByLabelText("Row 2 relay"), { target: { value: "2" } });
    expect(screen.queryByTestId("validation-messages")).not.toBeInTheDocument();
  });

  it("detects overlapping windows inside a row", async () => {
    renderRoutes(WRITER, "/experiments/new");
    await screen.findByRole("button", { name: "Save draft" });
    fireEvent.click(screen.getAllByRole("button", { name: "Add window" })[0] as HTMLElement);
    fireEvent.change(screen.getByLabelText("Row 1 Window 2 on time"), { target: { value: "17:00" } });
    fireEvent.change(screen.getByLabelText("Row 1 Window 2 off time"), { target: { value: "20:00" } });
    expect(screen.getByTestId("validation-messages")).toHaveTextContent(
      "Row 1: Windows 1 and 2 overlap (Mon 17:00 to Mon 18:00).",
    );
  });

  it("creates the experiment with IST times converted to UTC", async () => {
    server.use(
      http.post(apiUrl("/experiments"), async ({ request }) => {
        calls.push({ method: "POST", url: "/experiments", body: await request.json() });
        return HttpResponse.json(envelope(experiment()), { status: 201 });
      }),
    );
    renderRoutes(WRITER, "/experiments/new");
    fireEvent.change(await screen.findByLabelText("Experiment code"), { target: { value: "EXP-1" } });
    fireEvent.change(screen.getByLabelText("Experiment title"), { target: { value: "Light spectrum trial" } });
    fireEvent.change(screen.getByLabelText("Starts at"), { target: { value: "2099-01-01T05:30" } });
    fireEvent.change(screen.getByLabelText("Ends at"), { target: { value: "2099-01-08T05:30" } });
    fireEvent.change(screen.getByLabelText("Row 1 group"), { target: { value: "Control" } });
    fireEvent.change(screen.getByLabelText("Row 1 device"), { target: { value: "LED-01" } });
    fireEvent.change(screen.getByLabelText("Row 1 relay"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      code: "EXP-1",
      title: "Light spectrum trial",
      startsAt: "2099-01-01T00:00:00.000Z",
      endsAt: "2099-01-08T00:00:00.000Z",
      assignments: [
        { groupLabel: "Control", deviceId: "LED-01", relay: 3, windows: [{ days: ALL, on: "06:00", off: "18:00" }] },
      ],
    });
    expect(await screen.findByTestId("experiment-status")).toHaveTextContent("Draft"); // navigated to the saved experiment
  });

  it("shows the server message when the code is taken", async () => {
    server.use(
      http.post(apiUrl("/experiments"), () =>
        HttpResponse.json({ statusCode: 409, message: "Experiment code EXP-1 is already in use", errorCode: "EXPERIMENT_CODE_TAKEN" }, { status: 409 }),
      ),
    );
    renderRoutes(WRITER, "/experiments/new");
    fireEvent.change(await screen.findByLabelText("Experiment code"), { target: { value: "EXP-1" } });
    fireEvent.change(screen.getByLabelText("Experiment title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Starts at"), { target: { value: "2099-01-01T05:30" } });
    fireEvent.change(screen.getByLabelText("Ends at"), { target: { value: "2099-01-08T05:30" } });
    fireEvent.change(screen.getByLabelText("Row 1 group"), { target: { value: "C" } });
    fireEvent.change(screen.getByLabelText("Row 1 device"), { target: { value: "LED-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already in use");
  });
});

describe("ExperimentPage lifecycle", () => {
  it("DRAFT: Make ready asks for confirmation and sends one request", async () => {
    recordAction("ready", () => experiment({ status: "READY" }));
    renderRoutes(RUNNER, `/experiments/${current.id}`);
    fireEvent.click(await screen.findByRole("button", { name: "Make ready" }));
    expect(screen.getByText("Make experiment EXP-1 ready?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Make ready" }));
    clickConfirm("Make ready");
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(await screen.findByText(/The programme was sent/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("experiment-status")).toHaveTextContent("Ready"));
    // READY offers start, resend, revert, stop
    for (const name of ["Start", "Send programme again", "Return to draft", "Stop"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    // a READY experiment is read-only
    expect(screen.getByLabelText("Experiment title")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
  });

  it("start / pause / resume / stop each need a confirmation that explains the mode change", async () => {
    current = experiment({ status: "READY" });
    deviceRows = devicesStatus({
      config: { deviceId: "LED-01", configVersion: 1, status: "APPLIED", publishedAt: T0, appliedAt: T0, reason: null, sourceVersions: [] },
      carriesExperiment: true,
    });
    recordAction("start", () => experiment({ status: "RUNNING" }));
    recordAction("pause", () => experiment({ status: "PAUSED" }));
    recordAction("resume", () => experiment({ status: "RUNNING" }));
    recordAction("stop", () => experiment({ status: "STOPPED" }));
    renderRoutes(RUNNER, `/experiments/${current.id}`);

    expect(await screen.findByTestId("experiment-device-LED-01")).toHaveTextContent("Config 1: Confirmed by the device");

    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    expect(screen.getByText("Start experiment EXP-1?")).toBeInTheDocument();
    expect(screen.getByText(/switched OFF/)).toBeInTheDocument();
    clickConfirm("Start experiment");
    await waitFor(() => expect(screen.getByTestId("experiment-status")).toHaveTextContent("Running"));

    fireEvent.click(await screen.findByRole("button", { name: "Pause" }));
    expect(screen.getByText(/MAINTENANCE mode/)).toBeInTheDocument();
    clickConfirm("Pause experiment");
    await waitFor(() => expect(screen.getByTestId("experiment-status")).toHaveTextContent("Paused"));

    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
    clickConfirm("Resume experiment");
    await waitFor(() => expect(screen.getByTestId("experiment-status")).toHaveTextContent("Running"));

    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    expect(screen.getByText(/MANUAL mode/)).toBeInTheDocument();
    clickConfirm("Stop experiment");
    await waitFor(() => expect(screen.getByTestId("experiment-status")).toHaveTextContent("Stopped"));
    expect(calls.map((c) => c.url)).toEqual(["start", "pause", "resume", "stop"]);
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
  });

  it("a refused start lists what is missing per device", async () => {
    current = experiment({ status: "READY" });
    server.use(
      http.post(apiUrl(`/experiments/${current.id}/start`), () =>
        HttpResponse.json(
          {
            statusCode: 409,
            message: "Not every device is ready for the experiment",
            errorCode: "EXPERIMENT_NOT_CONFIGURED",
            details: { devices: [{ deviceId: "LED-01", reasons: ["EXPERIMENT_CONFIG_NOT_APPLIED", "DEVICE_OFFLINE"] }] },
          },
          { status: 409 },
        ),
      ),
    );
    renderRoutes(RUNNER, `/experiments/${current.id}`);
    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    clickConfirm("Start experiment");
    expect(await screen.findByRole("alert")).toHaveTextContent("Not every device is ready");
    expect(screen.getByTestId("action-problems")).toHaveTextContent("LED-01 has not confirmed the programme yet, is offline");
  });

  it("shows device warnings of a stop (e.g. an offline device)", async () => {
    current = experiment({ status: "RUNNING" });
    server.use(
      http.post(apiUrl(`/experiments/${current.id}/stop`), () => {
        current = experiment({ status: "STOPPED" });
        return HttpResponse.json(
          envelope(action(current, { warnings: [{ deviceId: "LED-01", code: "DEVICE_OFFLINE", message: "Device is offline" }] })),
        );
      }),
    );
    renderRoutes(RUNNER, `/experiments/${current.id}`);
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    clickConfirm("Stop experiment");
    expect(await screen.findByTestId("action-warnings")).toHaveTextContent("LED-01: Device is offline");
  });

  it("run buttons need EXPERIMENT_RUN; write buttons need EXPERIMENT_WRITE", async () => {
    current = experiment({ status: "READY" });
    const { unmount } = renderRoutes(WRITER, `/experiments/${current.id}`);
    await screen.findByTestId("experiment-status");
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return to draft" })).toBeInTheDocument();
    unmount();
    renderRoutes(["EXPERIMENT_READ", "EXPERIMENT_RUN"], `/experiments/${current.id}`);
    await screen.findByTestId("experiment-status");
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Return to draft" })).not.toBeInTheDocument();
  });

  it("shows the event log and refreshes the device status when a device answers", async () => {
    current = experiment({ status: "READY" });
    logRows = [
      { at: T0, source: "AUDIT", type: "EXPERIMENT_READY", deviceId: null, actorEmail: "op@example.test", data: {} },
      { at: T0, source: "DEVICE", type: "CONFIG_APPLIED", deviceId: "LED-01", actorEmail: null, data: { config_version: 1 } },
    ];
    renderRoutes(RUNNER, `/experiments/${current.id}`);
    const log = await screen.findByTestId("experiment-log");
    await waitFor(() => expect(log).toHaveTextContent("EXPERIMENT_READY"));
    expect(log).toHaveTextContent("CONFIG_APPLIED · LED-01");

    expect(await screen.findByTestId("experiment-device-LED-01")).toHaveTextContent("Programme not on the device");
    deviceRows = devicesStatus({
      config: { deviceId: "LED-01", configVersion: 1, status: "APPLIED", publishedAt: T0, appliedAt: T0, reason: null, sourceVersions: [] },
      carriesExperiment: true,
    });
    act(() =>
      last().trigger("schedule:updated", {
        v: 1,
        deviceId: "LED-01",
        at: T0,
        data: { scheduleId: null, roomId: null, status: null, configs: [] },
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("experiment-device-LED-01")).toHaveTextContent("Confirmed by the device"),
    );
  });
});
