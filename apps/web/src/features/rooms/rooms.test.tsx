import type { RoomChannelViewDto, RoomDto } from "@cimcms/contracts";
import type { RelayView } from "@features/ledControl/hooks/useLedController";
import { RelayGrid } from "@features/ledControl/components/RelayGrid";
import { setSession } from "@store/slices/authSlice";
import { RoomDetailPage } from "@view/rooms/RoomDetailPage";
import { RoomsPage } from "@view/rooms/RoomsPage";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { apiUrl, envelope } from "../../test/apiUrl";
import { server } from "../../test/server";
import { createTestStore, makeUser, renderWithProviders } from "../../test/utils";

const T0 = "2026-11-21T10:00:00.000Z";

// TODO(owner-decision O-9): fixture names only, real rooms come from the owner.
const room = (over: Partial<RoomDto> = {}): RoomDto => ({
  id: "665f0000-0000-4000-8000-00000000000a",
  farmId: null,
  code: "TRA",
  name: "Test Room A",
  status: "ACTIVE",
  notes: null,
  channelCount: 1,
  createdAt: T0,
  updatedAt: T0,
  ...over,
});
const roomB = room({ id: "665f0000-0000-4000-8000-00000000000b", code: "TRB", name: "Test Room B", channelCount: 1 });

const page = <T,>(data: T[]) => ({
  data,
  pagination: { total: data.length, page: 1, limit: 100, totalPages: 1 },
});

const login = (permissions: string[]) => {
  const store = createTestStore();
  store.dispatch(setSession({ accessToken: "tok", user: makeUser(permissions) }));
  return store;
};

describe("RoomsPage", () => {
  it("lists rooms and creates one (ROOM_WRITE)", async () => {
    const created: unknown[] = [];
    server.use(
      http.get(apiUrl("/rooms"), () => HttpResponse.json(envelope(page([room(), roomB])))),
      http.post(apiUrl("/rooms"), async ({ request }) => {
        created.push(await request.json());
        return HttpResponse.json(envelope(room({ id: "665f0000-0000-4000-8000-00000000000c", code: "TRC", name: "Test Room C", channelCount: 0 })), { status: 201 });
      }),
    );
    renderWithProviders(<RoomsPage />, { store: login(["ROOM_READ", "ROOM_WRITE"]) });

    expect(await screen.findByText("Test Room A")).toBeInTheDocument();
    expect(screen.getByTestId("room-row-TRB")).toHaveTextContent("Test Room B");

    fireEvent.click(screen.getByRole("button", { name: "Create room" }));
    const create = screen.getByRole("button", { name: "Create" });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Room code"), { target: { value: "TRC" } });
    fireEvent.change(screen.getByLabelText("Room name"), { target: { value: "Test Room C" } });
    expect(create).toBeEnabled();
    fireEvent.click(create);
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toEqual({ code: "TRC", name: "Test Room C" });
  });

  it("hides the create button without ROOM_WRITE and shows the server error", async () => {
    server.use(http.get(apiUrl("/rooms"), () => HttpResponse.json(envelope(page([room()])))));
    renderWithProviders(<RoomsPage />, { store: login(["ROOM_READ"]) });
    await screen.findByText("Test Room A");
    expect(screen.queryByRole("button", { name: "Create room" })).not.toBeInTheDocument();
  });

  it("shows the duplicate-code error from the server", async () => {
    server.use(
      http.get(apiUrl("/rooms"), () => HttpResponse.json(envelope(page([])))),
      http.post(apiUrl("/rooms"), () =>
        HttpResponse.json(
          { statusCode: 409, message: "Room code TRA is already in use", errorCode: "ROOM_CODE_TAKEN" },
          { status: 409 },
        ),
      ),
    );
    renderWithProviders(<RoomsPage />, { store: login(["ROOM_READ", "ROOM_WRITE"]) });
    fireEvent.click(await screen.findByRole("button", { name: "Create room" }));
    fireEvent.change(screen.getByLabelText("Room code"), { target: { value: "TRA" } });
    fireEvent.change(screen.getByLabelText("Room name"), { target: { value: "dup" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Room code TRA is already in use");
  });
});

describe("RoomDetailPage channel picker", () => {
  const assignments: RoomChannelViewDto[] = [
    { deviceId: "LED-01", relay: 1, label: null, roomId: room().id, roomCode: "TRA", roomName: "Test Room A" },
    { deviceId: "LED-01", relay: 2, label: null, roomId: roomB.id, roomCode: "TRB", roomName: "Test Room B" },
  ];

  const setup = (putStatus = 200) => {
    const puts: unknown[] = [];
    server.use(
      http.get(apiUrl("/devices"), () =>
        HttpResponse.json(
          envelope(
            page([
              { id: "665f0000-0000-4000-8000-000000000001", deviceId: "LED-01", name: "LED 1", type: "LED_CONTROLLER", createdAt: T0, updatedAt: T0, state: null },
              { id: "665f0000-0000-4000-8000-000000000002", deviceId: "HUM-01", name: "Hum", type: "HUMIDIFIER", createdAt: T0, updatedAt: T0, state: null },
            ]),
          ),
        ),
      ),
      http.get(apiUrl(`/rooms/${room().id}`), () => HttpResponse.json(envelope(room()))),
      http.get(apiUrl(`/rooms/${room().id}/channels`), () =>
        HttpResponse.json(envelope([{ deviceId: "LED-01", relay: 1, label: null }])),
      ),
      http.get(apiUrl("/room-channels"), () => HttpResponse.json(envelope(assignments))),
      http.put(apiUrl(`/rooms/${room().id}/channels`), async ({ request }) => {
        puts.push(await request.json());
        if (putStatus === 409) {
          return HttpResponse.json(
            { statusCode: 409, message: "Relay 2 of LED-01 is already assigned to room Test Room B (TRB)", errorCode: "RELAY_ALREADY_ASSIGNED" },
            { status: 409 },
          );
        }
        return HttpResponse.json(envelope([{ deviceId: "LED-01", relay: 1, label: null }, { deviceId: "LED-01", relay: 3, label: "Top shelf" }]));
      }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/rooms/:roomId" element={<RoomDetailPage />} />
      </Routes>,
      { store: login(["ROOM_READ", "ROOM_WRITE", "DEVICE_READ"]), route: `/rooms/${room().id}` },
    );
    return puts;
  };

  it("shows which relays are taken by another room and disables them", async () => {
    setup();
    expect(await screen.findByTestId("taken-LED-01-2")).toHaveTextContent("Taken by Test Room B");
    expect(screen.getByRole("checkbox", { name: "Relay 2 of LED-01" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Relay 1 of LED-01" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Relay 3 of LED-01" })).toBeEnabled();
    // The humidifier has no channels: no picker for it.
    expect(screen.queryByText("HUM-01")).not.toBeInTheDocument();
  });

  it("saves the full channel set including labels", async () => {
    const puts = setup();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Relay 3 of LED-01" }));
    fireEvent.change(screen.getByLabelText("Label for relay 3 of LED-01"), { target: { value: "Top shelf" } });
    fireEvent.click(screen.getByRole("button", { name: "Save channels" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      channels: [
        { deviceId: "LED-01", relay: 1 },
        { deviceId: "LED-01", relay: 3, label: "Top shelf" },
      ],
    });
    expect(await screen.findByText("Channels saved")).toBeInTheDocument();
  });

  it("shows the conflict message from the server", async () => {
    setup(409);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Relay 3 of LED-01" }));
    fireEvent.click(screen.getByRole("button", { name: "Save channels" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already assigned to room Test Room B");
  });

  it("is read-only without ROOM_WRITE", async () => {
    server.use(
      http.get(apiUrl("/devices"), () => HttpResponse.json(envelope(page([])))),
      http.get(apiUrl(`/rooms/${room().id}`), () => HttpResponse.json(envelope(room()))),
      http.get(apiUrl(`/rooms/${room().id}/channels`), () => HttpResponse.json(envelope([]))),
    );
    renderWithProviders(
      <Routes>
        <Route path="/rooms/:roomId" element={<RoomDetailPage />} />
      </Routes>,
      { store: login(["ROOM_READ"]), route: `/rooms/${room().id}` },
    );
    await screen.findByText("Relay channels");
    expect(screen.queryByRole("button", { name: "Save channels" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save room" })).not.toBeInTheDocument();
  });
});

describe("RelayGrid room labels", () => {
  const views = (): RelayView[] =>
    Array.from({ length: 16 }, (_, i) => ({
      relay: i + 1,
      reportedOn: false,
      pending: null,
      lastCommand: null,
      lastChangeAt: null,
      room:
        i === 0
          ? { roomId: "a", roomCode: "TRA", roomName: "Test Room A", label: "Shelf 1" }
          : i === 1
            ? { roomId: "b", roomCode: "TRB", roomName: "Test Room B", label: null }
            : null,
    }));
  const common = { simulation: true, showControls: false, canCommand: false, bulkPending: false, onSet: () => undefined };

  it("shows the room on the card and groups by room", () => {
    const { rerender } = renderWithProviders(<RelayGrid relays={views()} {...common} />);
    expect(screen.getByTestId("relay-room-1")).toHaveTextContent("Room: Test Room A · Shelf 1");
    expect(screen.getByTestId("relay-room-2")).toHaveTextContent("Room: Test Room B");
    expect(screen.getByTestId("relay-room-3")).toHaveTextContent("Room: not assigned");

    rerender(<RelayGrid relays={views()} groupByRoom {...common} />);
    const a = screen.getByTestId("relay-group-a");
    expect(within(a).getAllByTestId(/^relay-card-/)).toHaveLength(1);
    expect(screen.getByTestId("relay-group-none")).toHaveTextContent("Not assigned");
    expect(within(screen.getByTestId("relay-group-none")).getAllByTestId(/^relay-card-/)).toHaveLength(14);
  });
});
