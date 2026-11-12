import { BadRequestError } from "../../core/errors/AppError";
import type { MediaLogType } from "../media/mediaLog.model";
import { TtlCache } from "./http";
import type {
  MetadataAdapter,
  MetadataCandidate,
  MetadataDetails,
  MetadataProvider,
} from "./metadata.types";
import { tmdbMovies, tmdbShows } from "./providers/tmdb";
import { openLibrary } from "./providers/openLibrary";
import { musicBrainz } from "./providers/musicBrainz";
import { steam } from "./providers/steam";

const ADAPTERS: Record<MetadataProvider, MetadataAdapter> = {
  "tmdb-movie": tmdbMovies,
  "tmdb-tv": tmdbShows,
  openlibrary: openLibrary,
  musicbrainz: musicBrainz,
  steam,
};

/** Which catalogue each media panel searches. */
const PROVIDER_FOR_TYPE: Record<MediaLogType, MetadataProvider> = {
  movie: "tmdb-movie",
  tvshow: "tmdb-tv",
  book: "openlibrary",
  music_album: "musicbrainz",
  game: "steam",
};

const MIN_QUERY_LENGTH = 2;

// Typing re-issues the same prefixes, and catalogue data changes slowly.
// The caches also keep us well inside MusicBrainz's 1 req/s limit.
const searchCache = new TtlCache<MetadataCandidate[]>(60 * 60_000, 500);
const detailsCache = new TtlCache<MetadataDetails>(24 * 60 * 60_000, 500);

export const searchMetadata = async (
  type: MediaLogType,
  rawQuery: string,
): Promise<MetadataCandidate[]> => {
  const query = rawQuery.trim().replace(/\s+/g, " ");
  if (query.length < MIN_QUERY_LENGTH) return [];

  const adapter = ADAPTERS[PROVIDER_FOR_TYPE[type]];
  const key = `${adapter.provider}:${query.toLowerCase()}`;

  const cached = searchCache.get(key);
  if (cached) return cached;

  const results = await adapter.search(query);
  searchCache.set(key, results);
  return results;
};

export const getMetadataDetails = async (
  provider: MetadataProvider,
  id: string,
): Promise<MetadataDetails> => {
  const adapter = ADAPTERS[provider];
  if (!adapter.idPattern.test(id)) {
    throw new BadRequestError(`Invalid ${adapter.label} id`);
  }

  const key = `${provider}:${id}`;
  const cached = detailsCache.get(key);
  if (cached) return cached;

  const details = await adapter.details(id);
  detailsCache.set(key, details);
  return details;
};
