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
