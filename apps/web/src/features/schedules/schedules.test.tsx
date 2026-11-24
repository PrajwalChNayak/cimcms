import type {
  DeviceConfigDto,
  RoomDto,
  ScheduleDeviceStatusDto,
  ScheduleDto,
  ScheduleVersionDto,
} from "@cimcms/contracts";
import {
  connectRealtime,
  resetRealtimeForTests,
  type RealtimeStore,
} from "@shared/realtime/socketClient";
import { setSession } from "@store/slices/authSlice";
import { SchedulePage } from "@view/schedules/SchedulePage";
import { SchedulesPage } from "@view/schedules/SchedulesPage";
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

// TODO(owner-decision O-9): fixture room names only.
const room = (over: Partial<RoomDto> = {}): RoomDto => ({
  id: "665f0000-0000-4000-8000-00000000000a",
  farmId: null,
  code: "TRA",
  name: "Test Room A",
  status: "ACTIVE",
  notes: null,
  channelCount: 2,
  createdAt: T0,
  updatedAt: T0,
  ...over,
});
const roomB = room({ id: "665f0000-0000-4000-8000-00000000000b", code: "TRB", name: "Test Room B", channelCount: 0 });

const version = (over: Partial<ScheduleVersionDto> = {}): ScheduleVersionDto => ({
  version: 1,
  rules: [{ days: ALL, on: "06:00", off: "18:00" }],
  effectiveFrom: "2026-11-01",
  effectiveTo: null,
  createdByEmail: "op@example.test",
  createdAt: T0,
  publishedAt: null,
  ...over,
});

const schedule = (over: Partial<ScheduleDto> = {}): ScheduleDto => ({
  id: "665f0000-0000-4000-8000-0000000000c1",
  roomId: room().id,
  roomCode: "TRA",
  roomName: "Test Room A",
  name: "Daily light",
  status: "DRAFT",
  latestVersion: 1,
  publishedVersion: null,
  latest: version(),
  published: null,
  createdAt: T0,
  updatedAt: T0,
  ...over,
});

const config = (over: Partial<DeviceConfigDto> = {}): DeviceConfigDto => ({
  deviceId: "LED-01",
  configVersion: 1,
  status: "PUBLISHED",
  publishedAt: T0,
  appliedAt: null,
  reason: null,
  sourceVersions: [{ scheduleId: schedule().id, version: 1 }],
  ...over,
});

const page = <T,>(data: T[]) => ({
  data,
  pagination: { total: data.length, page: 1, limit: 100, totalPages: 1 },
});

let current: ScheduleDto;
let deviceStatus: ScheduleDeviceStatusDto[];
let versions: ScheduleVersionDto[];
let writes: Array<{ method: string; url: string; body: unknown }>;

beforeEach(() => {
  sockets.length = 0;
  current = schedule();
  deviceStatus = [{ deviceId: "LED-01", relays: [1, 2], config: null }];
  versions = [version()];
  writes = [];
  server.use(
    http.get(apiUrl("/rooms"), () => HttpResponse.json(envelope(page([room(), roomB])))),
    http.get(apiUrl(`/rooms/${room().id}`), () => HttpResponse.json(envelope(room()))),
    http.get(apiUrl("/schedules"), () => HttpResponse.json(envelope(page([current])))),
    http.get(apiUrl(`/schedules/${schedule().id}`), () => HttpResponse.json(envelope(current))),
    http.get(apiUrl(`/schedules/${schedule().id}/versions`), () => HttpResponse.json(envelope(versions))),
    http.get(apiUrl(`/schedules/${schedule().id}/devices`), () => HttpResponse.json(envelope(deviceStatus))),
  );
});
afterEach(() => resetRealtimeForTests());

const last = () => sockets[sockets.length - 1];

const WRITER = ["SCHEDULE_READ", "SCHEDULE_WRITE", "ROOM_READ"];
const PUBLISHER = [...WRITER, "SCHEDULE_PUBLISH"];

const renderRoutes = (permissions: string[], route: string) => {
  const store = createTestStore();
  store.dispatch(setSession({ accessToken: "tok", user: makeUser(permissions, { roles: ["OPERATOR"] }) }));
  connectRealtime(store as unknown as RealtimeStore);
  const view = renderWithProviders(
    <Routes>
      <Route path="/schedules" element={<SchedulesPage />} />
      <Route path="/schedules/new/:roomId" element={<SchedulePage />} />
      <Route path="/schedules/:scheduleId" element={<SchedulePage />} />
    </Routes>,
    { store, route },
  );
  act(() => last().serverConnects());
  return { store, ...view };
};

describe("SchedulesPage", () => {
  it("lists schedules and the rooms that have none (create link needs SCHEDULE_WRITE)", async () => {
    renderRoutes(WRITER, "/schedules");
    expect(await screen.findByTestId(`schedule-row-${schedule().id}`)).toHaveTextContent("Daily light");
    expect(screen.getByTestId(`schedule-row-${schedule().id}`)).toHaveTextContent("Draft");
    expect(await screen.findByTestId("room-without-TRB")).toHaveTextContent("Create schedule");
    expect(screen.queryByTestId("room-without-TRA")).not.toBeInTheDocument();
  });

  it("read-only users do not see the create links", async () => {
    renderRoutes(["SCHEDULE_READ", "ROOM_READ"], "/schedules");
    await screen.findByTestId(`schedule-row-${schedule().id}`);
    expect(screen.queryByTestId("room-without-TRB")).not.toBeInTheDocument();
  });
});

describe("SchedulePage editor", () => {
  it("validates in the browser: on = off, no day and overlapping windows block saving", async () => {
    renderRoutes(WRITER, `/schedules/new/${room().id}`);
    const save = await screen.findByRole("button", { name: "Save draft" });
    expect(save).toBeDisabled(); // name is empty
    fireEvent.change(screen.getByLabelText("Schedule name"), { target: { value: "Veg room" } });
    expect(save).toBeEnabled();
    expect(screen.queryByTestId("validation-messages")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Window 1 off time"), { target: { value: "06:00" } });
    expect(screen.getByTestId("validation-messages")).toHaveTextContent("Window 1: on and off time must be different.");
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Window 1 off time"), { target: { value: "18:00" } });

    fireEvent.click(screen.getByRole("button", { name: "Add window" }));
    fireEvent.change(screen.getByLabelText("Window 2 on time"), { target: { value: "17:00" } });
    fireEvent.change(screen.getByLabelText("Window 2 off time"), { target: { value: "20:00" } });
    expect(screen.getByTestId("validation-messages")).toHaveTextContent("Windows 1 and 2 overlap (Mon 17:00 to Mon 18:00).");
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Window 2 on time"), { target: { value: "18:00" } }); // touching is fine
    expect(screen.queryByTestId("validation-messages")).not.toBeInTheDocument();
    expect(save).toBeEnabled();

    for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      fireEvent.click(screen.getByLabelText(`Window 2 ${d}`));
    }
    expect(screen.getByTestId("validation-messages")).toHaveTextContent("Window 2: choose at least one day.");
  });

  it("shows that a window ends the next day", async () => {
    renderRoutes(WRITER, `/schedules/new/${room().id}`);
    await screen.findByRole("button", { name: "Save draft" });
    fireEvent.change(screen.getByLabelText("Window 1 on time"), { target: { value: "22:00" } });
    fireEvent.change(screen.getByLabelText("Window 1 off time"), { target: { value: "06:00" } });
    expect(screen.getByText("ends the next day")).toBeInTheDocument();
  });

  it("creates a schedule (POST) and opens it", async () => {
    server.use(
      http.post(apiUrl("/schedules"), async ({ request }) => {
        writes.push({ method: "POST", url: "/schedules", body: await request.json() });
        return HttpResponse.json(envelope(schedule()), { status: 201 });
      }),
    );
    renderRoutes(WRITER, `/schedules/new/${room().id}`);
    fireEvent.change(await screen.findByLabelText("Schedule name"), { target: { value: "Daily light" } });
    fireEvent.change(screen.getByLabelText("First day"), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.body).toEqual({
      roomId: room().id,
      name: "Daily light",
      rules: [{ days: ALL, on: "06:00", off: "18:00" }],
      effectiveFrom: "2026-11-01",
    });
    // navigated to the saved schedule
    expect(await screen.findByTestId("schedule-status")).toHaveTextContent("Draft");
  });

  it("shows the server message when saving fails (e.g. one schedule per room)", async () => {
    server.use(
      http.post(apiUrl("/schedules"), () =>
        HttpResponse.json(
          { statusCode: 409, message: 'Room Test Room A already has the schedule "Daily light"', errorCode: "SCHEDULE_EXISTS_FOR_ROOM" },
          { status: 409 },
        ),
      ),
    );
    renderRoutes(WRITER, `/schedules/new/${room().id}`);
    fireEvent.change(await screen.findByLabelText("Schedule name"), { target: { value: "Another" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already has the schedule");
  });

  it("edits a draft: PUT with the changed fields, publish is blocked while unsaved", async () => {
    server.use(
      http.put(apiUrl(`/schedules/${schedule().id}`), async ({ request }) => {
        writes.push({ method: "PUT", url: "", body: await request.json() });
        return HttpResponse.json(envelope(current));
      }),
    );
    renderRoutes(PUBLISHER, `/schedules/${schedule().id}`);
    const publish = await screen.findByRole("button", { name: "Publish" });
    expect(publish).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled(); // nothing changed

    fireEvent.change(screen.getByLabelText("Window 1 on time"), { target: { value: "07:00" } });
    expect(publish).toBeDisabled();
    expect(screen.getByText(/unsaved changes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.body).toEqual({
      name: "Daily light",
      rules: [{ days: ALL, on: "07:00", off: "18:00" }],
      effectiveFrom: "2026-11-01",
      effectiveTo: null,
    });
    expect(await screen.findByText("Draft saved")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled());
  });

  it("publish asks for confirmation, sends one POST and shows the device acknowledgement from the socket", async () => {
    server.use(
      http.post(apiUrl(`/schedules/${schedule().id}/publish`), () => {
        writes.push({ method: "POST", url: "publish", body: null });
        current = schedule({ status: "PUBLISHED", publishedVersion: 1, latest: version({ publishedAt: T0 }), published: version({ publishedAt: T0 }) });
        deviceStatus = [{ deviceId: "LED-01", relays: [1, 2], config: config() }];
        versions = [version({ publishedAt: T0 })];
        return HttpResponse.json(envelope({ schedule: current, configs: [config()] }));
      }),
    );
    renderRoutes(PUBLISHER, `/schedules/${schedule().id}`);
    expect(await screen.findByTestId("device-status-LED-01")).toHaveTextContent("Nothing has been sent to this device yet");

    fireEvent.click(await screen.findByRole("button", { name: "Publish" }));
    expect(screen.getByText('Publish schedule "Daily light"?')).toBeInTheDocument();
    expect(screen.getByText(/sent to 1 device/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(writes).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    const dialogButtons = screen.getAllByRole("button", { name: "Publish" });
    fireEvent.click(dialogButtons[dialogButtons.length - 1] as HTMLElement);
    await waitFor(() => expect(writes).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByTestId("device-status-LED-01")).toHaveTextContent("Config 1: Sent — waiting for the device to confirm"),
    );
    expect(screen.getByTestId("schedule-status")).toHaveTextContent("Published · running version 1");
    expect(screen.getByTestId("version-history")).toHaveTextContent("Version 1");

    // the device confirms: schedule:updated invalidates the status, which is re-read
    deviceStatus = [{ deviceId: "LED-01", relays: [1, 2], config: config({ status: "APPLIED", appliedAt: T0 }) }];
    act(() =>
      last().trigger("schedule:updated", {
        v: 1,
        deviceId: "LED-01",
        at: T0,
        data: { scheduleId: null, roomId: null, status: null, configs: [config({ status: "APPLIED" })] },
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("device-status-LED-01")).toHaveTextContent("Applied by the device"),
    );
  });

  it("shows a rejection reason from the device", async () => {
    deviceStatus = [{ deviceId: "LED-01", relays: [1], config: config({ status: "REJECTED", reason: "NVS_FULL" }) }];
    renderRoutes(PUBLISHER, `/schedules/${schedule().id}`);
    expect(await screen.findByTestId("device-status-LED-01")).toHaveTextContent("Rejected by the device: NVS_FULL");
  });

  it("a published latest version cannot be republished; archived schedules are read-only", async () => {
    current = schedule({ status: "PUBLISHED", publishedVersion: 1, latest: version({ publishedAt: T0 }), published: version({ publishedAt: T0 }) });
    const { unmount } = renderRoutes(PUBLISHER, `/schedules/${schedule().id}`);
    expect(await screen.findByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByText(/already published/)).toBeInTheDocument();
    unmount();

    current = schedule({ status: "ARCHIVED" });
    renderRoutes(PUBLISHER, `/schedules/${schedule().id}`);
    await screen.findByTestId("schedule-status");
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Schedule name")).toBeDisabled();
  });

  it("without SCHEDULE_WRITE the schedule is read-only; without SCHEDULE_PUBLISH there is no publish button", async () => {
    const { unmount } = renderRoutes(["SCHEDULE_READ", "ROOM_READ"], `/schedules/${schedule().id}`);
    await screen.findByTestId("schedule-status");
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add window" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Schedule name")).toBeDisabled();
    unmount();

    renderRoutes(WRITER, `/schedules/${schedule().id}`);
    await screen.findByTestId("schedule-status");
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
  });

  it("explains when the room has no relays", async () => {
    deviceStatus = [];
    renderRoutes(PUBLISHER, `/schedules/${schedule().id}`);
    expect(await screen.findByText(/no relays assigned yet/)).toBeInTheDocument();
  });
});
