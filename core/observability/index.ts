import * as Sentry from "@sentry/node";

/**
 * Error reporting to Sentry. Off unless SENTRY_DSN is set, so local runs and
 * tests send nothing. Only errors are sent (no tracing), and no request
 * bodies or user details beyond the Clerk user id.
 */
const dsn = process.env.SENTRY_DSN?.trim() ?? "";
export const sentryEnabled = dsn !== "";

export const initSentry = () => {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.RAILWAY_GIT_COMMIT_SHA,
    tracesSampleRate: 0,
  });
};

/** Reports an unexpected error. `context` lands in the event's extra data. */
export const reportError = (error: unknown, context?: Record<string, unknown>) => {
  if (!sentryEnabled) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
};

/** Waits for queued events before the process exits. */
export const flushErrors = async (timeoutMs = 2_000) => {
  if (sentryEnabled) await Sentry.flush(timeoutMs);
};
