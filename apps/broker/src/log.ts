/** One JSON line per event. Never pass passwords or payloads here. */
type Fields = Record<string, unknown>;

const write = (level: string, message: string, fields: Fields = {}): void => {
  if (process.env.BROKER_LOG === "silent") return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
  if (level === "error" || level === "warn") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
};

export const log = {
  info: (message: string, fields?: Fields) => write("info", message, fields),
  warn: (message: string, fields?: Fields) => write("warn", message, fields),
  error: (message: string, fields?: Fields) => write("error", message, fields),
};
