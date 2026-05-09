import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";

export function extractErrorMessage(
  err: unknown,
  fallback = "Something went wrong.",
): string {
  if (typeof err === "object" && err !== null) {
    if ("status" in err) {
      const e = err as FetchBaseQueryError;
      if (typeof e.data === "object" && e.data !== null && "message" in e.data)
        return (e.data as { message: string }).message;
      return `Server error (${e.status})`;
    }
    if (
      "message" in err &&
      typeof (err as { message: unknown }).message === "string"
    )
      return (err as { message: string }).message;
  }
  return fallback;
}
