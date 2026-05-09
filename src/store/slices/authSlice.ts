import { authApi } from "@api/authApi";
import type { User } from "@appTypes/auth.types";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

interface AuthState {
  token: string | null;
  userId: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isInitialized?: boolean;
  loginTime?: number | null;
}

const initialState: AuthState = {
  token: null,
  userId: null,
  user: null,
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
      action: PayloadAction<
        | { token: string; userId?: string; loginTime?: number }
        | null
        | undefined
      >,
    ) => {
      const token = action.payload?.token ?? null;
      state.token = token;
      state.userId = action.payload?.userId ?? state.userId;
      state.loginTime = action.payload?.loginTime ?? state.loginTime;
      state.isAuthenticated = !!token;
      state.isLoading = false;
      state.error = null;
    },
    setUser: (state, action: PayloadAction<User | null>) => {
      state.user = action.payload;
      if (action.payload) {
        state.userId = action.payload.id;
      }
    },
    setAuthError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    clearError: (state) => {
      state.error = null;
    },
    logout: () => ({ ...initialState }),
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
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
        const result = action.payload?.result;
        const token = result?.authToken ?? null;
        state.token = token;
        state.userId = result?.id ?? null;
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
  setUser,
  setAuthError,
  clearError,
  logout,
  setLoading,
  setInitialized,
} = authSlice.actions;

// Selectors
export const selectAuth = (state: { auth: AuthState }) => state.auth;
export const selectAuthToken = (state: { auth: AuthState }) => state.auth.token;
export const selectAuthUserId = (state: { auth: AuthState }) =>
  state.auth.userId;
export const selectIsAuthenticated = (state: { auth: AuthState }) =>
  state.auth.isAuthenticated;
export const selectAuthUser = (state: { auth: AuthState }) => state.auth.user;
export const selectAuthRole = (state: { auth: AuthState }) =>
  state.auth.user?.role ?? null;
export const selectIsLoading = (state: { auth: AuthState }) =>
  state.auth.isLoading;
export const selectAuthError = (state: { auth: AuthState }) => state.auth.error;
export const selectCurrentUser = (state: { auth: AuthState }) =>
  state.auth.user;

export default authSlice.reducer;
