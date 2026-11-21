import { setSession } from "@store/slices/authSlice";
import { ReportsPage } from "@view/reports/ReportsPage";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiUrl, envelope } from "../../test/apiUrl";
import { server } from "../../test/server";
import { createTestStore, makeUser, renderWithProviders } from "../../test/utils";
import { validateRange } from "./reportDownload";

vi.mock("socket.io-client", async () => {
  const { createFakeIo } = await import("../../test/fakeSocket");
  return { io: vi.fn(createFakeIo()) };
});

const T0 = "2026-11-21T10:00:00.000Z";
const led = { id: "665f00000000000000000001", deviceId: "LED-01", name: "LED Controller 1", type: "LED_CONTROLLER", createdAt: T0, updatedAt: T0, state: null };

let seen: { url: URL; auth: string | null }[];
let createUrl: ReturnType<typeof vi.fn>;
let revokeUrl: ReturnType<typeof vi.fn>;
let clicked: { download: string }[];

beforeEach(() => {
  seen = [];
  clicked = [];
  createUrl = vi.fn(() => "blob:test");
  revokeUrl = vi.fn();
  Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ download: this.download });
  });
  server.use(
    http.get(apiUrl("/devices"), () =>
      HttpResponse.json(envelope({ data: [led], pagination: { total: 1, page: 1, limit: 100, totalPages: 1 } })),
    ),
    http.get(apiUrl("/reports/:name"), ({ request }) => {
      seen.push({ url: new URL(request.url), auth: request.headers.get("authorization") });
      return new HttpResponse("a,b\r\n1,2\r\n", {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="commands_2026-11-01_2026-11-07.csv"',
        },
      });
    }),
  );
});
afterEach(() => vi.restoreAllMocks());

const open = (permissions = ["REPORT_EXPORT", "DEVICE_READ"]) => {
  const store = createTestStore();
  store.dispatch(setSession({ accessToken: "tok-123", user: makeUser(permissions) }));
  return renderWithProviders(<ReportsPage />, { store, route: "/reports" });
};

const pick = (from: string, to: string) => {
  fireEvent.change(screen.getByLabelText("From (IST date)"), { target: { value: from } });
  fireEvent.change(screen.getByLabelText("To (IST date)"), { target: { value: to } });
};

describe("validateRange", () => {
  it("accepts 1 to 31 days only", () => {
    expect(validateRange("2026-11-01", "2026-11-01")).toBeNull();
    expect(validateRange("2026-10-01", "2026-10-31")).toBeNull();
    expect(validateRange("2026-10-01", "2026-11-01")).toMatch(/at most 31/);
    expect(validateRange("2026-11-02", "2026-11-01")).toMatch(/before/);
    expect(validateRange("", "2026-11-01")).toMatch(/Pick/);
  });
});

describe("ReportsPage", () => {
  it("renders a download button per report", async () => {
    open();
    expect(screen.getByRole("heading", { name: "Reports" })).toBeInTheDocument();
    for (const n of ["Relay ON time", "Commands", "Availability"]) {
      expect(screen.getByRole("button", { name: `Download ${n} CSV` })).toBeInTheDocument();
    }
    expect(await screen.findByRole("option", { name: "LED Controller 1" })).toBeInTheDocument();
  });

  it("blocks a download without a valid range and makes no request", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Download Commands CSV" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pick a start and an end date.");
    pick("2026-10-01", "2026-11-15");
    fireEvent.click(screen.getByRole("button", { name: "Download Commands CSV" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at most 31 days");
    expect(seen).toHaveLength(0);
  });

  it("fetches with the bearer token (IST day bounds) and saves the file", async () => {
    open();
    await screen.findByRole("option", { name: "LED Controller 1" });
    pick("2026-11-01", "2026-11-07");
    fireEvent.change(screen.getByLabelText("Device"), { target: { value: "LED-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Download Commands CSV" }));

    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(seen[0].auth).toBe("Bearer tok-123");
    expect(seen[0].url.pathname.endsWith("/reports/commands.csv")).toBe(true);
    expect(seen[0].url.searchParams.get("from")).toBe("2026-10-31T18:30:00.000Z");
    expect(seen[0].url.searchParams.get("to")).toBe("2026-11-07T18:29:59.999Z");
    expect(seen[0].url.searchParams.get("deviceId")).toBe("LED-01");
    expect(clicked[0].download).toBe("commands_2026-11-01_2026-11-07.csv");
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent("commands_2026-11-01_2026-11-07.csv");
  });

  it("shows the server error message", async () => {
    server.use(
      http.get(apiUrl("/reports/:name"), () =>
        HttpResponse.json({ message: "Range must not exceed 31 days" }, { status: 400 }),
      ),
    );
    open();
    pick("2026-11-01", "2026-11-02");
    fireEvent.click(screen.getByRole("button", { name: "Download Availability CSV" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Range must not exceed 31 days");
    expect(clicked).toHaveLength(0);
  });
});
