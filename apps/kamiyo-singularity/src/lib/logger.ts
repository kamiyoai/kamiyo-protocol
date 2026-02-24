/* eslint-disable no-console */

type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, args: unknown[]) {
  if (process.env.NODE_ENV === "production" && level === "info") {
    return;
  }

  const sink = console[level] ?? console.log;
  sink(...args);
}

export const logger = {
  info: (...args: unknown[]) => write("info", args),
  warn: (...args: unknown[]) => write("warn", args),
  error: (...args: unknown[]) => write("error", args),
};
