export type RssiLabel =
  | "Excellent"
  | "Very good"
  | "Good"
  | "Weak"
  | "Very weak";

/** FRS RSSI table: -30..-50 Excellent, -51..-60 Very good, -61..-70 Good, -71..-80 Weak, < -80 Very weak. */
export const rssiLabel = (dbm: number): RssiLabel => {
  if (dbm >= -50) return "Excellent"; // -30 and stronger
  if (dbm >= -60) return "Very good";
  if (dbm >= -70) return "Good";
  if (dbm >= -80) return "Weak";
  return "Very weak";
};
