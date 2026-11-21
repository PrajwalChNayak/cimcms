import type { Middleware, MiddlewareAPI } from "@reduxjs/toolkit";
import { isRejectedWithValue } from "@reduxjs/toolkit";
import { logout } from "@store/slices/authSlice";
import { addToast } from "@store/slices/toastSlice";

export const authMiddleware: Middleware =
  (_store: MiddlewareAPI) => (next) => (action) => {
    return next(action);
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

      const endpointName = (
        action as { meta?: { arg?: { endpointName?: string } } }
      ).meta?.arg?.endpointName;
      // Auth endpoints handle their own 401 (bad password / no session at boot).
      const isAuthEndpoint =
        endpointName !== undefined &&
        ["login", "refresh", "logout"].includes(endpointName);

      if (isAuthEndpoint) {
        // no global toast/logout: the caller shows the error
      } else if (status === 401) {
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
