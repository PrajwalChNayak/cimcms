import type { Middleware, MiddlewareAPI } from "@reduxjs/toolkit";
import { isRejectedWithValue } from "@reduxjs/toolkit";
import { logout } from "@store/slices/authSlice";
import { addToast } from "@store/slices/toastSlice";

export const authMiddleware: Middleware =
  (store: MiddlewareAPI) => (next) => (action) => {
    const result = next(action);
    const typedAction = action as { type?: string };

    if (typedAction.type?.startsWith("auth/")) {
      if (import.meta.env.DEV) {
        const authState = store.getState().auth as {
          isAuthenticated: boolean;
          token: string | null;
          userId?: string | null;
        };
        console.log(`🔐 Auth action: ${typedAction.type}`, {
          isAuthenticated: authState.isAuthenticated,
          hasToken: !!authState.token,
          userId: authState.userId,
        });
      }
    }

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

      if (persistedAuth && import.meta.env.DEV) {
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
        store.dispatch(
          addToast({
            type: "error",
            message: "Session expired. Please login again.",
          }),
        );
      } else if (status === 403) {
        store.dispatch(
          addToast({
            type: "error",
            message: "Access denied. You don't have permission.",
          }),
        );
      } else if (status !== undefined && status >= 500) {
        store.dispatch(
          addToast({
            type: "error",
            message: "Server error. Please try again later.",
          }),
        );
      }

      if (import.meta.env.DEV) {
        console.error("🚨 API Error:", {
          action: (action as { type?: string }).type,
          error,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return next(action);
  };

export const performanceMiddleware: Middleware =
  (_store: MiddlewareAPI) => (next) => (action) => {
    if (!import.meta.env.DEV) {
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

    return result;
  };
