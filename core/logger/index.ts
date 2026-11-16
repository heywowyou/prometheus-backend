type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minLevel: Level =
  (process.env.LOG_LEVEL as Level | undefined) ??
  (process.env.NODE_ENV === "production" ? "info" : "debug");

const enabled = (level: Level) => LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];

/** Set by the error reporter so logged errors also reach Sentry (avoids an import cycle). */
let onError: ((message: string, meta?: unknown) => void) | null = null;
export const setErrorSink = (sink: typeof onError) => {
  onError = sink;
};

const emit = (level: Level, message: string, meta?: unknown) => {
  if (level === "error") onError?.(message, meta);
  if (!enabled(level)) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (meta === undefined) sink(line);
  else sink(line, meta);
};

export const logger = {
  debug: (message: string, meta?: unknown) => emit("debug", message, meta),
  info: (message: string, meta?: unknown) => emit("info", message, meta),
  warn: (message: string, meta?: unknown) => emit("warn", message, meta),
  error: (message: string, meta?: unknown) => emit("error", message, meta),
};

export default logger;
