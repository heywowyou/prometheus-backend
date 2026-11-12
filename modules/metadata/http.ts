import { NotFoundError, UpstreamError } from "../../core/errors/AppError";
import logger from "../../core/logger";

const TIMEOUT_MS = 8_000;

/** MusicBrainz requires a descriptive User-Agent; the others appreciate one. */
export const USER_AGENT = "Prometheus/1.0 (personal media log)";

/** Max results returned to the dropdown, per search. */
export const MAX_RESULTS = 8;

/**
 * GETs JSON from a metadata source.
 *
 * Every failure mode becomes an AppError so the client gets a readable
 * message: unreachable or broken → 502, unknown id → 404.
 */
export const getJson = async <T>(
  url: string,
  label: string,
  headers: Record<string, string> = {},
): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json", ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    logger.warn(`${label} request failed: ${url}`, error);
    throw new UpstreamError(`${label} is unreachable right now`);
  }

  if (response.status === 404) throw new NotFoundError(`${label} entry`);
  if (!response.ok) {
    logger.warn(`${label} answered HTTP ${response.status}: ${url}`);
    throw new UpstreamError(`${label} returned an error (HTTP ${response.status})`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new UpstreamError(`${label} returned an unreadable response`);
  }
};

/**
 * Whether an image URL currently resolves. Used to avoid offering covers that
 * would 404 when the media service tries to import them on save.
 */
export const imageExists = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Cover Art Archive and Open Library answer with a redirect to the file.
    return response.ok || (response.status >= 300 && response.status < 400);
  } catch {
    return false;
  }
};

/** First four-digit year in a date-ish string ("2021-09-15", "17 Sep, 2020"). */
export const parseYear = (value: string | null | undefined): number | undefined => {
  const match = value ? /\b(\d{4})\b/.exec(value) : null;
  return match?.[1] ? Number(match[1]) : undefined;
};

/** Serialises calls so they are at least `intervalMs` apart (MusicBrainz: 1/s). */
export const createThrottle = (intervalMs: number) => {
  let next = 0;
  return async <T>(task: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const wait = Math.max(0, next - now);
    next = Math.max(now, next) + intervalMs;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    return task();
  };
};

/** A small in-memory TTL cache; evicts the oldest entry once full. */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expires: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}
