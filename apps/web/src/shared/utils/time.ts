/** Display time zone (D-17): store UTC everywhere, show Asia/Kolkata in the UI only. */
const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  dateStyle: "medium",
  timeStyle: "medium",
});

const isValid = (iso: string | null | undefined): iso is string =>
  !!iso && !Number.isNaN(Date.parse(iso));

/** ISO UTC string -> "21 Nov 2026, 3:30:00 pm" in IST. Null/invalid -> em dash. */
export const formatIst = (iso: string | null | undefined): string =>
  isValid(iso) ? IST.format(new Date(iso)) : "—";

/** ISO UTC string -> "just now" / "5m ago" / "3h ago" / "2d ago". Null/invalid -> em dash. */
export const formatRelative = (
  iso: string | null | undefined,
  now: number = Date.now(),
): string => {
  if (!isValid(iso)) return "—";
  const secs = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const IST_OFFSET_MS = 330 * 60_000; // UTC+05:30, no DST (D-17)
const DAY_MS = 24 * 60 * 60_000;
const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

const istDayStartMs = (date: string): number | null => {
  const m = DATE_INPUT.exec(date);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(ms) ? null : ms - IST_OFFSET_MS;
};

/**
 * `<input type="date">` value (YYYY-MM-DD, read as an IST calendar day, because the
 * UI shows IST everywhere) -> ISO UTC of 00:00:00.000 IST that day. Invalid -> undefined.
 */
export const istDateStartToUtcIso = (date: string): string | undefined => {
  const ms = istDayStartMs(date);
  return ms === null ? undefined : new Date(ms).toISOString();
};

/** Same, but the last millisecond (23:59:59.999 IST) of that day. */
export const istDateEndToUtcIso = (date: string): string | undefined => {
  const ms = istDayStartMs(date);
  return ms === null ? undefined : new Date(ms + DAY_MS - 1).toISOString();
};

/** Elapsed time between two ISO strings: "850 ms", "1.2 s", "2 m 5 s". Missing/invalid -> em dash. */
export const formatDuration = (
  fromIso: string | null | undefined,
  toIso: string | null | undefined,
): string => {
  if (!isValid(fromIso) || !isValid(toIso)) return "—";
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  if (ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} m ${Math.round((ms % 60_000) / 1000)} s`;
};

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * `<input type="datetime-local">` value (YYYY-MM-DDTHH:mm, read as IST wall-clock time because
 * the UI shows IST everywhere) -> ISO UTC. Invalid -> undefined.
 */
export const istLocalToUtcIso = (value: string): string | undefined => {
  const m = LOCAL_INPUT.exec(value);
  if (!m) return undefined;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(ms) ? undefined : new Date(ms - IST_OFFSET_MS).toISOString();
};

/** ISO UTC -> `datetime-local` value showing the IST wall-clock time. Invalid -> empty string. */
export const utcIsoToIstLocal = (iso: string | null | undefined): string =>
  isValid(iso) ? new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 16) : "";
