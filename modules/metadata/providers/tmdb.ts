import config from "../../../core/config";
import { ServiceUnavailableError } from "../../../core/errors/AppError";
import { getJson, MAX_RESULTS, parseYear, uniqueCovers } from "../http";
import type { CoverOption, MetadataAdapter, MetadataDetails } from "../metadata.types";

const API = "https://api.themoviedb.org/3";
const IMAGES = "https://image.tmdb.org/t/p";
const LABEL = "TMDB";

interface TmdbSearchResponse<T> {
  results?: T[];
}

interface TmdbMovie {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
  credits?: { crew?: Array<{ job?: string; name?: string }> };
}

interface TmdbShow {
  id: number;
  name?: string;
  original_name?: string;
  first_air_date?: string;
  poster_path?: string | null;
  created_by?: Array<{ name?: string }>;
}

interface TmdbImage {
  file_path?: string;
  /** "en", "fr"… or null for a textless poster. */
  iso_639_1?: string | null;
}

const get = <T>(path: string, params: Record<string, string> = {}) => {
  if (!config.tmdbReadToken) {
    throw new ServiceUnavailableError(
      "Movie and TV lookup is off: TMDB_READ_TOKEN is not set",
    );
  }
  const query = new URLSearchParams({ language: "en-US", ...params });
  return getJson<T>(`${API}${path}?${query.toString()}`, LABEL, {
    authorization: `Bearer ${config.tmdbReadToken}`,
  });
};

const poster = (path: string | null | undefined, size: "w185" | "w500") =>
  path ? `${IMAGES}/${size}${path}` : undefined;

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
};

/**
 * Every poster TMDB has, in its own order (most voted first). Limited to
 * English, French and textless ones: the rest are mostly regional prints the
 * picker would only be cluttered by.
 */
const posters = async (kind: "movie" | "tv", id: string): Promise<CoverOption[]> => {
  const data = await get<{ posters?: TmdbImage[] }>(`/${kind}/${id}/images`, {
    include_image_language: "en,fr,null",
  });
  return uniqueCovers(
    (data.posters ?? [])
      .filter((image) => image.file_path)
      .map((image) => ({
        url: poster(image.file_path, "w500") as string,
        thumbnailUrl: poster(image.file_path, "w185") as string,
        label: image.iso_639_1
          ? (LANGUAGE_NAMES[image.iso_639_1] ?? image.iso_639_1.toUpperCase())
          : "No text",
      })),
  );
};

/** Only show the original title when it differs, e.g. for foreign films. */
const originalIfDifferent = (title?: string, original?: string) =>
  original && original !== title ? original : undefined;

export const tmdbMovies: MetadataAdapter = {
  provider: "tmdb-movie",
  label: LABEL,
  idPattern: /^\d{1,10}$/,

  async search(query) {
    const data = await get<TmdbSearchResponse<TmdbMovie>>("/search/movie", {
      query,
      include_adult: "false",
    });
    return (data.results ?? []).slice(0, MAX_RESULTS).map((movie) => ({
      provider: "tmdb-movie",
      externalId: String(movie.id),
      title: movie.title ?? "Untitled",
      year: parseYear(movie.release_date),
      subtitle: originalIfDifferent(movie.title, movie.original_title),
      thumbnailUrl: poster(movie.poster_path, "w185"),
    }));
  },

  async details(id): Promise<MetadataDetails> {
    const movie = await get<TmdbMovie>(`/movie/${id}`, {
      append_to_response: "credits",
    });
    const directors = (movie.credits?.crew ?? [])
      .filter((member) => member.job === "Director" && member.name)
      .map((member) => member.name as string);

    return {
      provider: "tmdb-movie",
      externalId: String(movie.id),
      title: movie.title ?? "Untitled",
      year: parseYear(movie.release_date),
      coverUrl: poster(movie.poster_path, "w500"),
      url: `https://www.themoviedb.org/movie/${movie.id}`,
      credits: { director: directors.join(", ") || undefined },
    };
  },

  covers: (id) => posters("movie", id),
};

export const tmdbShows: MetadataAdapter = {
  provider: "tmdb-tv",
  label: LABEL,
  idPattern: /^\d{1,10}$/,

  async search(query) {
    const data = await get<TmdbSearchResponse<TmdbShow>>("/search/tv", { query });
    return (data.results ?? []).slice(0, MAX_RESULTS).map((show) => ({
      provider: "tmdb-tv",
      externalId: String(show.id),
      title: show.name ?? "Untitled",
      year: parseYear(show.first_air_date),
      subtitle: originalIfDifferent(show.name, show.original_name),
      thumbnailUrl: poster(show.poster_path, "w185"),
    }));
  },

  async details(id): Promise<MetadataDetails> {
    const show = await get<TmdbShow>(`/tv/${id}`);
    return {
      provider: "tmdb-tv",
      externalId: String(show.id),
      title: show.name ?? "Untitled",
      year: parseYear(show.first_air_date),
      coverUrl: poster(show.poster_path, "w500"),
      url: `https://www.themoviedb.org/tv/${show.id}`,
      // TV logs have no credit fields yet.
      credits: {},
    };
  },

  covers: (id) => posters("tv", id),
};
