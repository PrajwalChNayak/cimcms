import { ENV } from "@config/env";
import type { Dispatch, UnknownAction } from "@reduxjs/toolkit";
import {
  createApi,
  fetchBaseQuery,
  type BaseQueryApi,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { logout, setSession } from "@store/slices/authSlice";
import type { RootState } from "@store/store";
import { sessionResponseSchema } from "@shared/utils/apiSchemas";

const baseQuery = fetchBaseQuery({
  baseUrl: ENV.API_BASE_URL,
  timeout: ENV.API_TIMEOUT,
  // The refresh token is an HttpOnly cookie: it must be sent on every call.
  credentials: "include",
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth?.accessToken;
    if (token) headers.set("authorization", `Bearer ${token}`);
    return headers;
  },
});

/** URLs that must never trigger a refresh-and-retry on 401. */
const NO_REFRESH_URLS = [
  "/user/login",
  "/user/token/refresh",
  "/user/token/logout",
];

const urlOf = (args: string | FetchArgs): string =>
  typeof args === "string" ? args : args.url;

/** Minimal store surface needed to refresh (store, or RTK `api` in a base query). */
export interface RefreshHost {
  dispatch: Dispatch<UnknownAction>;
  getState: () => unknown;
}

// One shared in-flight refresh: parallel 401s (and the socket client) wait for it.
let refreshPromise: Promise<boolean> | null = null;

/**
 * Refresh the session through the HttpOnly cookie. Resolves true on success
 * (new token + user stored), false on failure (auth/logout dispatched and the
 * RTK Query cache reset). Concurrent callers share one network request.
 * This is the hook point used by the realtime client.
 */
export function refreshSession(host: RefreshHost): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const api = {
        signal: new AbortController().signal,
        abort: () => undefined,
        dispatch: host.dispatch,
        getState: host.getState,
        extra: undefined,
        endpoint: "refresh",
        type: "mutation",
        forced: false,
      } as unknown as BaseQueryApi;
      const res = await baseQuery(
        { url: "/user/token/refresh", method: "POST" },
        api,
        {},
      );
      const parsed = sessionResponseSchema.safeParse(res.data);
      if (res.error || !parsed.success) throw new Error("refresh failed");
      host.dispatch(setSession(parsed.data.result));
      return true;
    } catch {
      host.dispatch(logout());
      host.dispatch(baseApi.util.resetApiState());
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const tokenUsed = (api.getState() as RootState).auth?.accessToken ?? null;
  let result = await baseQuery(args, api, extraOptions);

  if (
    result.error?.status === 401 &&
    !NO_REFRESH_URLS.includes(urlOf(args)) &&
    tokenUsed !== null
  ) {
    const tokenNow = (api.getState() as RootState).auth?.accessToken ?? null;
    // If another request already refreshed while ours was in flight, just retry.
    const ok =
      tokenNow !== tokenUsed ? true : await refreshSession(api);
    if (ok) result = await baseQuery(args, api, extraOptions);
  }
  return result;
};

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    "Auth",
    "Farm",
    "Device",
    "DeviceState",
    "DeviceTelemetry",
    "DeviceEvents",
    "DeviceCommands",
    "RelayChanges",
    "MasterTypeConstant",
    "Permission",
    "Role",
  ] as const,
  endpoints: () => ({}),
  keepUnusedDataFor: 60,
  refetchOnMountOrArgChange: 30,
  refetchOnFocus: true,
  refetchOnReconnect: true,
});
