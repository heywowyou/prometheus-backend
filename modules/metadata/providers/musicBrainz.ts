import { createThrottle, getJson, imageExists, MAX_RESULTS, parseYear } from "../http";
import type {
  MetadataAdapter,
  MetadataCandidate,
  MetadataDetails,
} from "../metadata.types";

const API = "https://musicbrainz.org/ws/2";
const LABEL = "MusicBrainz";

/** MusicBrainz allows one request per second per client. */
const throttled = createThrottle(1_100);

interface ArtistCredit {
  name?: string;
  joinphrase?: string;
}

interface ReleaseGroup {
  id: string;
  title?: string;
  "primary-type"?: string | null;
  "first-release-date"?: string;
  "artist-credit"?: ArtistCredit[];
}

/** "Simon & Garfunkel", "Jay-Z feat. Kanye West" — credits carry their joiners. */
const artistName = (credits: ArtistCredit[] | undefined) =>
  (credits ?? []).map((c) => `${c.name ?? ""}${c.joinphrase ?? ""}`).join("").trim() ||
  undefined;

/** Escapes Lucene syntax so a title like "Help!" is searched literally. */
const escapeLucene = (text: string) =>
  text.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, "\\$1");

const coverArt = (id: string, size: 250 | 500) =>
  `https://coverartarchive.org/release-group/${id}/front-${size}`;

/** Logs are for albums; singles and compilations-of-one would only be noise. */
const ALBUM_TYPES = new Set(["Album", "EP"]);

/** MusicBrainz + Cover Art Archive — no key needed. */
export const musicBrainz: MetadataAdapter = {
  provider: "musicbrainz",
  label: LABEL,
  idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,

  async search(query) {
    // Free text matches title and artist, so "ok computer radiohead" works.
    const params = new URLSearchParams({
      query: escapeLucene(query),
      fmt: "json",
      limit: "15",
    });
    const data = await throttled(() =>
      getJson<{ "release-groups"?: ReleaseGroup[] }>(
        `${API}/release-group/?${params.toString()}`,
        LABEL,
      ),
    );

    return (data["release-groups"] ?? [])
      .filter((group) => ALBUM_TYPES.has(group["primary-type"] ?? ""))
      .slice(0, MAX_RESULTS)
      .map(
        (group): MetadataCandidate => ({
          provider: "musicbrainz",
          externalId: group.id,
          title: group.title ?? "Untitled",
          year: parseYear(group["first-release-date"]),
          subtitle: [
            artistName(group["artist-credit"]),
            group["primary-type"] === "EP" ? "EP" : undefined,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
          // May 404 when no art exists; the dropdown hides broken images.
          thumbnailUrl: coverArt(group.id, 250),
        }),
      );
  },

  async details(id): Promise<MetadataDetails> {
    const group = await throttled(() =>
      getJson<ReleaseGroup>(
        `${API}/release-group/${id}?inc=artist-credits&fmt=json`,
        LABEL,
      ),
    );
    const cover = coverArt(id, 500);

    return {
      provider: "musicbrainz",
      externalId: id,
      title: group.title ?? "Untitled",
      year: parseYear(group["first-release-date"]),
      // Not every release group has art; only offer one that will import.
      coverUrl: (await imageExists(cover)) ? cover : undefined,
      url: `https://musicbrainz.org/release-group/${id}`,
      credits: { artist: artistName(group["artist-credit"]) },
    };
  },
};
