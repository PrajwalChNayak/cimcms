export type ReportKind = "relay-on-time" | "commands" | "availability";

export const REPORTS: { kind: ReportKind; label: string; description: string }[] = [
  { kind: "relay-on-time", label: "Relay ON time", description: "Seconds each relay was ON, per IST day." },
  { kind: "commands", label: "Commands", description: "Every command issued, with outcome." },
  { kind: "availability", label: "Availability", description: "Online, stale and offline transitions." },
];

export const MAX_RANGE_DAYS = 31;
const DAY_MS = 24 * 60 * 60_000;

/** `from`/`to` are `<input type="date">` values read as IST days. Returns an error text or null. */
export const validateRange = (from: string, to: string): string | null => {
  if (!from || !to) return "Pick a start and an end date.";
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (Number.isNaN(days)) return "Pick a start and an end date.";
  if (days < 1) return "The end date must not be before the start date.";
  if (days > MAX_RANGE_DAYS) return `The range can be at most ${MAX_RANGE_DAYS} days.`;
  return null;
};

const filenameOf = (header: string | null, fallback: string): string => {
  const m = header ? /filename="?([^";]+)"?/i.exec(header) : null;
  return m?.[1] ?? fallback;
};

/** Saves a blob through a temporary link (the token is in memory, so a plain <a href> cannot be used). */
export const saveBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export interface DownloadArgs {
  baseUrl: string;
  kind: ReportKind;
  fromIso: string;
  toIso: string;
  deviceId?: string;
  getToken: () => string | null;
  /** Called once on 401; resolves true when a fresh token is available. */
  refresh?: () => Promise<boolean>;
}

/** Fetches a report CSV with the bearer token and saves it. Throws Error(message) on failure. */
export const downloadReport = async (a: DownloadArgs): Promise<string> => {
  const params = new URLSearchParams({ from: a.fromIso, to: a.toIso });
  if (a.deviceId) params.set("deviceId", a.deviceId);
  const url = `${a.baseUrl}/reports/${a.kind}.csv?${params.toString()}`;
  const call = () =>
    fetch(url, {
      credentials: "include",
      headers: { Authorization: `Bearer ${a.getToken() ?? ""}`, Accept: "text/csv" },
    });

  let res = await call();
  if (res.status === 401 && a.refresh && (await a.refresh())) res = await call();
  if (!res.ok) {
    let message = `Download failed (${res.status}).`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  const filename = filenameOf(res.headers.get("content-disposition"), `${a.kind}.csv`);
  saveBlob(await res.blob(), filename);
  return filename;
};
