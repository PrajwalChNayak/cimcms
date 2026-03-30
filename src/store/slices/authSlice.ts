import { authApi } from "@api/authApi.ts";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isInitialized?: boolean;
  loginTime?: number | null;
}

// Only the accessToken is stored — no user/role/refresh data
const initialState: AuthState = {
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{ token?: string } | null | undefined>,
    ) => {
      const token = action.payload?.token ?? null;
      state.token = token;
      state.isAuthenticated = !!token;
      state.isLoading = false;
      state.error = null;
    },
    logout: () => ({ ...initialState }),
    clearError: (state) => {
      state.error = null;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },
    setInitialized: (state, action: PayloadAction<boolean>) => {
      state.isInitialized = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addMatcher(authApi.endpoints.login.matchPending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addMatcher(authApi.endpoints.login.matchFulfilled, (state, action) => {
        const payload = action.payload as {
          token?: string;
          result?: { accessToken?: string };
        };
        const token = payload?.token ?? payload?.result?.accessToken ?? null;
        state.token = token;
        state.isAuthenticated = !!token;
        state.isLoading = false;
        state.loginTime = token ? Date.now() : null;
        state.error = token ? null : "Unable to retrieve access token";
      })
      .addMatcher(authApi.endpoints.login.matchRejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.token = null;
        state.error = action.error?.message ?? "Login failed";
      });
  },
});

export const {
  setCredentials,
  logout,
  clearError,
  setLoading,
  setError,
  setInitialized,
} = authSlice.actions;

// Selectors
export const selectAuth = (state: { auth: AuthState }) => state.auth;
export const selectIsAuthenticated = (state: { auth: AuthState }) =>
  state.auth.isAuthenticated;
export const selectIsLoading = (state: { auth: AuthState }) =>
  state.auth.isLoading;
export const selectAuthError = (state: { auth: AuthState }) => state.auth.error;
export const selectAuthToken = (state: { auth: AuthState }) => state.auth.token;

// Backward-compatible stubs (always null/empty — no user data is stored)
export const selectCurrentUser = () => null;
export const selectUser = () => null;
export const selectUserPermissions = () => [];
export const selectPermissions = () => [];
export const selectRoles = () => [];
export const selectLoginResponse = () => null;
export const selectLoginTime = () => null;
export const selectTokenExpiry = () => null;
export const selectSessionId = () => null;
export const selectUserRole = () => null;
export const selectUserFullName = () => null;
export const selectUserInitials = () => null;

// Role/permission access selector — always grants access when authenticated
// (no roles/permissions stored since only the token is persisted)
export const selectHasPermission = () => () => false;
export const selectHasRole = () => () => false;
export const selectCanAccess =
  (requiredPermissions: string[] = [], requiredRoles: string[] = []) =>
  (state: { auth: AuthState }) => {
    if (!state.auth.isAuthenticated) return false;
    // No role data stored; grant access if route has no specific requirements
    return requiredPermissions.length === 0 && requiredRoles.length === 0;
  };

export type { AuthState };
export default authSlice.reducer;
