import type { Middleware, MiddlewareAPI } from "@reduxjs/toolkit";
import { isRejectedWithValue } from "@reduxjs/toolkit";
import { logout } from "@store/slices/authSlice.ts";

/**
 * Authentication middleware for handling auth state changes
 * Works with Redux Persist for proper state persistence
 */
export const authMiddleware: Middleware =
  (store: MiddlewareAPI) => (next) => (action) => {
    const result = next(action);
    const typedAction = action as { type?: string };

    // Handle auth state changes
    if (typedAction.type?.startsWith("auth/")) {
      if (process.env.NODE_ENV === "development") {
        const authState = store.getState().auth as {
          isAuthenticated: boolean;
          token: string | null;
          user?: { id: string };
        };
        console.log(`🔐 Auth action: ${typedAction.type}`, {
          isAuthenticated: authState.isAuthenticated,
          hasToken: !!authState.token,
          userId: authState.user?.id,
        });
      }
    }

    // Handle Redux Persist rehydration
    if (typedAction.type === "persist/REHYDRATE") {
      const persistedAuth = (
        action as {
          payload?: {
            auth?: {
              isAuthenticated?: boolean;
              token?: string;
              loginTime?: number;
            };
          };
        }
      ).payload?.auth;

      if (persistedAuth && process.env.NODE_ENV === "development") {
        console.log("🔄 Auth state rehydrated from persistence", {
          isAuthenticated: persistedAuth.isAuthenticated,
          hasToken: !!persistedAuth.token,
          loginTime: persistedAuth.loginTime
            ? new Date(persistedAuth.loginTime).toLocaleString()
            : null,
        });
      }
    }

    return result;
  };

/**
 * Enhanced RTK Query error handling middleware
 * Handles API errors and dispatches appropriate actions
 */
export const errorMiddleware: Middleware =
  (store: MiddlewareAPI) => (next) => (action) => {
    if (
      isRejectedWithValue(action) ||
      (action as { type?: string }).type?.endsWith("/rejected")
    ) {
      const error =
        (
          action as {
            payload?: { status?: number };
            error?: { status?: number };
          }
        ).payload ?? (action as { error?: { status?: number } }).error;
      const status = (error as { status?: number })?.status;

      if (status === 401) {
        store.dispatch(logout());
        store.dispatch({
          type: "ui/showNotification",
          payload: {
            type: "error",
            message: "Session expired. Please login again.",
          },
        });
      } else if (status === 403) {
        store.dispatch({
          type: "ui/showNotification",
          payload: {
            type: "error",
            message: "Access denied. You don't have permission.",
          },
        });
      } else if (status !== undefined && status >= 500) {
        store.dispatch({
          type: "ui/showNotification",
          payload: {
            type: "error",
            message: "Server error occurred. Please try again later.",
          },
        });
      }

      if (process.env.NODE_ENV === "development") {
        console.error("🚨 API Error:", {
          action: (action as { type?: string }).type,
          error,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return next(action);
  };

/**
 * Performance monitoring middleware (development only)
 * Logs slow actions and monitors state size
 */
export const performanceMiddleware: Middleware =
  (store: MiddlewareAPI) => (next) => (action) => {
    if (process.env.NODE_ENV !== "development") {
      return next(action);
    }

    const start = performance.now();
    const result = next(action);
    const end = performance.now();

    const duration = end - start;

    if (duration > 100) {
      console.warn(
        `🐌 Slow action detected: ${(action as { type?: string }).type} took ${duration.toFixed(2)}ms`,
      );
    }

    if (Math.random() < 0.1) {
      const state = store.getState();
      const stateSize = JSON.stringify(state).length;

      if (stateSize > 1_000_000) {
        console.warn(
          `📦 Large state detected: ${(stateSize / 1_000_000).toFixed(2)}MB`,
        );
      }
    }

    return result;
  };

/**
 * Action logger middleware (development only)
 * Logs all dispatched actions with state changes
 */
export const actionLogger: Middleware =
  (store: MiddlewareAPI) => (next) => (action) => {
    if (process.env.NODE_ENV !== "development") {
      return next(action);
    }

    const skipActions = [
      "persist/PERSIST",
      "persist/REHYDRATE",
      "@@redux-form",
      "ui/updateCursor",
    ];

    const actionType = (action as { type?: string }).type ?? "";
    if (skipActions.some((skip) => actionType.includes(skip))) {
      return next(action);
    }

    console.group(`🎬 Action: ${actionType}`);
    console.log("📥 Previous State:", store.getState());
    console.log("⚡ Action:", action);

    const result = next(action);

    console.log("📤 Next State:", store.getState());
    console.groupEnd();

    return result;
  };
