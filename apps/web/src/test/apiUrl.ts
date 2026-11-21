import { ENV } from "@config/env";

/** Absolute URL for an API path (vitest sets VITE_API_BASE_URL to an absolute origin). */
export const apiUrl = (path: string) => `${ENV.API_BASE_URL}${path}`;

export const envelope = <T>(result: T) => ({
  statusCode: 200,
  message: "ok",
  result,
});
