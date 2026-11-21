import { authApi } from "@api/authApi";
import { baseApi } from "@api/baseApi";
import { ProtectedRoute } from "@shared/router/ProtectedRoute";
import RoleGuard from "@shared/router/RoleGuard";
import { selectAuthToken, setSession } from "@store/slices/authSlice";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { apiUrl, envelope } from "../../test/apiUrl";
import { server } from "../../test/server";
import {
  createTestStore,
  makeUser,
  renderWithProviders,
} from "../../test/utils";
import { usePermission } from "../hooks/usePermission";
import { AppInitializer } from "./AppInitializer";

const sessionBody = (accessToken: string, permissions = ["DEVICE_READ"]) =>
  envelope({ accessToken, user: makeUser(permissions) });

const App = () => (
  <AppInitializer splashMinDuration={0}>
    <Routes>
      <Route path="/login" element={<div>Login page</div>} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <div>Dashboard for session</div>
          </ProtectedRoute>
        }
      />
    </Routes>
  </AppInitializer>
);

describe("session restore on boot (refresh cookie)", () => {
  it("reload keeps the session when refresh succeeds", async () => {
    let refreshCalls = 0;
    server.use(
      http.post(apiUrl("/user/token/refresh"), () => {
        refreshCalls += 1;
        return HttpResponse.json(sessionBody("tok-1"));
      }),
    );
    const { store } = renderWithProviders(<App />, { route: "/dashboard" });

    expect(
      await screen.findByText("Dashboard for session", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(refreshCalls).toBe(1);
    expect(selectAuthToken(store.getState())).toBe("tok-1");
    expect(store.getState().auth.user?.email).toBe("tech@example.test");
  });

  it("refresh failure on boot shows the login page", async () => {
    server.use(
      http.post(apiUrl("/user/token/refresh"), () =>
        HttpResponse.json({ message: "no session" }, { status: 401 }),
      ),
    );
    const { store } = renderWithProviders(<App />, { route: "/dashboard" });

    expect(
      await screen.findByText("Login page", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(store.getState().auth.isInitialized).toBe(true);
  });
});

const pingApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    ping: builder.query<{ result: string }, string>({
      query: (id) => `/ping/${id}`,
    }),
  }),
});

describe("baseApi 401 handling", () => {
  it("two parallel 401s trigger exactly one refresh call, then both retry", async () => {
    let refreshCalls = 0;
    server.use(
      http.get(apiUrl("/ping/:id"), ({ request }) =>
        request.headers.get("authorization") === "Bearer new-token"
          ? HttpResponse.json({ result: "pong" })
          : HttpResponse.json({ message: "expired" }, { status: 401 }),
      ),
      http.post(apiUrl("/user/token/refresh"), async () => {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json(sessionBody("new-token"));
      }),
    );
    const store = createTestStore();
    store.dispatch(
      setSession({ accessToken: "old-token", user: makeUser(["DEVICE_READ"]) }),
    );

    const [a, b] = await Promise.all([
      store.dispatch(pingApi.endpoints.ping.initiate("a")),
      store.dispatch(pingApi.endpoints.ping.initiate("b")),
    ]);

    expect(refreshCalls).toBe(1);
    expect(a.data?.result).toBe("pong");
    expect(b.data?.result).toBe("pong");
    expect(selectAuthToken(store.getState())).toBe("new-token");
  });

  it("refresh failure logs out", async () => {
    server.use(
      http.get(apiUrl("/ping/:id"), () =>
        HttpResponse.json({ message: "expired" }, { status: 401 }),
      ),
      http.post(apiUrl("/user/token/refresh"), () =>
        HttpResponse.json({ message: "revoked" }, { status: 401 }),
      ),
    );
    const store = createTestStore();
    store.dispatch(
      setSession({ accessToken: "old-token", user: makeUser([]) }),
    );

    const res = await store.dispatch(pingApi.endpoints.ping.initiate("x"));

    expect(res.isError).toBe(true);
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(store.getState().auth.accessToken).toBeNull();
  });

  it("a 401 from login does not try to refresh", async () => {
    let refreshCalls = 0;
    server.use(
      http.post(apiUrl("/user/login"), () =>
        HttpResponse.json({ message: "bad credentials" }, { status: 401 }),
      ),
      http.post(apiUrl("/user/token/refresh"), () => {
        refreshCalls += 1;
        return HttpResponse.json(sessionBody("x"));
      }),
    );
    const store = createTestStore();
    store.dispatch(setSession({ accessToken: "t", user: makeUser([]) }));
    const res = await store.dispatch(
      authApi.endpoints.login.initiate({ email: "a@b.c", password: "nope" }),
    );
    expect("error" in res).toBe(true);
    expect(refreshCalls).toBe(0);
  });
});

const PermProbe = () => (
  <span>{usePermission("DEVICE_COMMAND") ? "can" : "cannot"}</span>
);

describe("permissions", () => {
  it("usePermission reads state.auth.user.permissions", () => {
    const store = createTestStore();
    store.dispatch(
      setSession({ accessToken: "t", user: makeUser(["DEVICE_COMMAND"]) }),
    );
    renderWithProviders(<PermProbe />, { store });
    expect(screen.getByText("can")).toBeInTheDocument();
  });

  it("route permissions are enforced (403 without permission)", async () => {
    const store = createTestStore();
    store.dispatch(
      setSession({ accessToken: "t", user: makeUser(["DEVICE_READ"]) }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/403" element={<div>Forbidden</div>} />
        <Route
          path="/users"
          element={
            <ProtectedRoute requiredPermissions={["USER_READ"]}>
              <div>Users page</div>
            </ProtectedRoute>
          }
        />
      </Routes>,
      { store, route: "/users" },
    );
    await waitFor(() =>
      expect(screen.getByText("Forbidden")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Users page")).not.toBeInTheDocument();
  });

  it("RoleGuard renders children only with a matching permission", () => {
    const store = createTestStore();
    store.dispatch(
      setSession({ accessToken: "t", user: makeUser(["DEVICE_READ"]) }),
    );
    renderWithProviders(
      <>
        <RoleGuard allowedPermissions={["DEVICE_READ"]}>
          <span>allowed</span>
        </RoleGuard>
        <RoleGuard
          allowedPermissions={["DEVICE_COMMAND"]}
          fallback={<span>blocked</span>}
        >
          <span>secret</span>
        </RoleGuard>
      </>,
      { store },
    );
    expect(screen.getByText("allowed")).toBeInTheDocument();
    expect(screen.getByText("blocked")).toBeInTheDocument();
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });
});
