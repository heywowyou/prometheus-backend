import dotenv from "dotenv";
import { isValidTimeZone } from "../domain/recurrence";

dotenv.config();

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See the environment section of CLAUDE.md.`,
    );
  }
  return value;
};

const optional = (name: string, fallback: string): string =>
  process.env[name]?.trim() || fallback;

/**
 * Validated configuration, read once at startup.
 *
 * Reading env vars through this object means a missing or malformed value
 * fails the process immediately with a clear message, instead of surfacing as
 * a confusing runtime error on the first request that happens to need it.
 */
export const config = {
  env: optional("NODE_ENV", "development"),
  port: Number(optional("PORT", "3000")),
  mongoUri: required("MONGODB_URI"),
  clerkSecretKey: required("CLERK_SECRET_KEY"),
  /** Comma-separated list, so staging and local can share one deployment. */
  corsOrigins: optional("CORS_ORIGIN", "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  cloudinary: {
    cloudName: required("CLOUDINARY_CLOUD_NAME"),
    apiKey: required("CLOUDINARY_API_KEY"),
    apiSecret: required("CLOUDINARY_API_SECRET"),
  },
  /**
   * IANA zone used for day/week boundaries when a request doesn't name one.
   * The frontend sends the browser's zone on every request, so this is only a
   * fallback for scripts and older clients.
   */
  timeZone: optional("APP_TIMEZONE", "UTC"),
  /**
   * TMDB read access token for movie/TV metadata. Optional so the API still
   * boots without it; movie and TV lookups then answer 503.
   */
  tmdbReadToken: optional("TMDB_READ_TOKEN", ""),
} as const;

export const isProduction = config.env === "production";

if (!Number.isFinite(config.port) || config.port <= 0) {
  throw new Error(`PORT must be a positive number, received "${process.env.PORT}"`);
}

if (!isValidTimeZone(config.timeZone)) {
  throw new Error(`APP_TIMEZONE is not a valid IANA time zone: "${config.timeZone}"`);
}

export default config;
