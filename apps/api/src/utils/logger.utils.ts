import type { Logform, config } from "winston";
import { addColors, createLogger, format, transports } from "winston";

const customColors: config.AbstractConfigSetColors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  verbose: "cyan",
  debug: "blue",
  silly: "grey",
};

addColors(customColors);

const isProduction = process.env.NODE_ENV === "production";

const SENSITIVE_KEY = /password|token|authorization|secret|cookie/i;
const REDACTED = "[REDACTED]";

/**
 * Returns a deep copy of `value` where the value of every key matching
 * SENSITIVE_KEY is replaced with "[REDACTED]", at any depth.
 */
export const redact = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }
  if (value instanceof Date) return value;

  const source: Record<string, unknown> =
    value instanceof Error
      ? {
          ...(value as unknown as Record<string, unknown>),
          name: value.name,
          message: value.message,
          stack: value.stack,
        }
      : (value as Record<string, unknown>);

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(source[key], seen);
  }
  return out;
};

// Redacts sensitive metadata. Reserved winston fields are left alone so that
// level/message/timestamp keep working.
const redactFormat = format((info) => {
  const { level, message, timestamp, ...meta } = info;
  void level;
  void message;
  void timestamp;
  const clean = redact(meta) as Record<string, unknown>;
  // Mutate in place so winston's internal symbol keys are preserved.
  for (const key of Object.keys(clean)) {
    info[key] = clean[key];
  }
  return info;
});

const developmentFormat = format.combine(
  format.colorize({ all: true }),
  format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr =
      Object.keys(meta).length > 0 ? "\n" + JSON.stringify(meta, null, 2) : "";
    return `${timestamp as string} [${level}]: ${message as string}${metaStr}`;
  }),
);

const logger = createLogger({
  level: "info",
  silent: process.env.NODE_ENV === "test",
  format: format.combine(
    format.timestamp(),
    redactFormat(),
    isProduction ? format.json() : developmentFormat,
  ),
  transports: [new transports.Console()],
});

export default logger;
