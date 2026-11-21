import type { User } from "@appTypes/auth.types";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

/**
 * Auth state lives in memory only (D-5): the access token is never persisted.
 * The refresh token is an HttpOnly cookie managed by the server.
 * This slice must not import any API module (baseApi imports this file).
 */
interface AuthState {
  accessToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  /** true once the boot-time refresh attempt has finished (success or failure) */
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  accessToken: null,
  user: null,
  isAuthenticated: false,
  isInitialized: false,
  isLoading: false,
  error: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setSession: (
      state,
      action: PayloadAction<{ accessToken: string; user: User }>,
    ) => {
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
      state.isAuthenticated = true;
      state.isLoading = false;
      state.error = null;
    },
    setUser: (state, action: PayloadAction<User | null>) => {
      state.user = action.payload;
    },
    setAuthError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    clearError: (state) => {
      state.error = null;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setInitialized: (state, action: PayloadAction<boolean>) => {
      state.isInitialized = action.payload;
    },
    // Keeps isInitialized = true so the app does not fall back to the splash.
    logout: () => ({ ...initialState, isInitialized: true }),
  },
});

export const {
  setSession,
  setUser,
  setAuthError,
  clearError,
  logout,
  setLoading,
  setInitialized,
} = authSlice.actions;

// Selectors
export const selectAuth = (state: { auth: AuthState }) => state.auth;
export const selectAuthToken = (state: { auth: AuthState }) =>
  state.auth.accessToken;
export const selectAuthUserId = (state: { auth: AuthState }) =>
  state.auth.user?.id ?? null;
export const selectIsAuthenticated = (state: { auth: AuthState }) =>
  state.auth.isAuthenticated;
export const selectIsInitialized = (state: { auth: AuthState }) =>
  state.auth.isInitialized;
export const selectAuthUser = (state: { auth: AuthState }) => state.auth.user;
export const selectAuthRoles = (state: { auth: AuthState }) =>
  state.auth.user?.roles;
export const selectAuthPermissions = (state: { auth: AuthState }) =>
  state.auth.user?.permissions;
export const selectIsLoading = (state: { auth: AuthState }) =>
  state.auth.isLoading;
export const selectAuthError = (state: { auth: AuthState }) => state.auth.error;
export const selectCurrentUser = (state: { auth: AuthState }) =>
  state.auth.user;

export default authSlice.reducer;
