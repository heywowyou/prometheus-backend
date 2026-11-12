/**
 * Where a media log's details came from. `tmdb-movie` and `tmdb-tv` are
 * separate because TMDB ids are only unique within a kind.
 */
export const METADATA_PROVIDERS = [
  "tmdb-movie",
  "tmdb-tv",
  "openlibrary",
  "musicbrainz",
  "steam",
] as const;
export type MetadataProvider = (typeof METADATA_PROVIDERS)[number];

/** A link from a media log to the catalogue entry it was filled from. */
export interface ExternalRef {
  provider: MetadataProvider;
  id: string;
}

/** One search hit — enough to recognise the right title in a dropdown. */
export interface MetadataCandidate {
  provider: MetadataProvider;
  externalId: string;
  title: string;
  /** Release / first-publication year. */
  year?: number;
  /** Disambiguation line: author, artist, original title… */
  subtitle?: string;
  /** Small image for the dropdown. Not stored. */
  thumbnailUrl?: string;
}

/** Credit fields, matching the media log's type-specific columns. */
export interface MetadataCredits {
  director?: string;
  author?: string;
  pages?: number;
  artist?: string;
}

/** Everything the media form can be filled with for one title. */
export interface MetadataDetails {
  provider: MetadataProvider;
  externalId: string;
  title: string;
  year?: number;
  /** Full-size cover. The media service copies it to Cloudinary on save. */
  coverUrl?: string;
  /** The title's page on the source site. */
  url?: string;
  credits: MetadataCredits;
}

export interface MetadataAdapter {
  provider: MetadataProvider;
  /** Shown in errors and in the UI attribution. */
  label: string;
  /** Ids are interpolated into upstream URLs, so they must match exactly. */
  idPattern: RegExp;
  search(query: string): Promise<MetadataCandidate[]>;
  details(id: string): Promise<MetadataDetails>;
}
