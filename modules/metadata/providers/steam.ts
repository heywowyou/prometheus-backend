import { NotFoundError } from "../../../core/errors/AppError";
import { getJson, imageExists, MAX_RESULTS, parseYear } from "../http";
import type {
  MetadataAdapter,
  MetadataCandidate,
  MetadataDetails,
} from "../metadata.types";

const LABEL = "Steam";

interface StoreSearchItem {
  id: number;
  name?: string;
  type?: string;
  tiny_image?: string;
}

interface AppDetails {
  success?: boolean;
  data?: {
    name?: string;
    header_image?: string;
    release_date?: { date?: string };
  };
}

/**
 * Store search returns soundtracks, demos and DLC as plain "app"s. The names
 * are the only signal available without one extra request per result.
 */
const NOT_A_GAME = /\b(soundtrack|ost|artbook|art book|demo|playtest|dlc|season pass|expansion pass|dedicated server)\b/i;

/** Portrait box art (2:3), matching the games panel's cover shape. */
const portrait = (id: string) =>
  `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900.jpg`;

/**
 * Steam store — no key needed. These are the public endpoints the store page
 * itself uses: unofficial and PC-only, but they cover most games.
 */
export const steam: MetadataAdapter = {
  provider: "steam",
  label: LABEL,
  idPattern: /^\d{1,10}$/,

  async search(query) {
    const params = new URLSearchParams({ term: query, l: "english", cc: "FR" });
    const data = await getJson<{ items?: StoreSearchItem[] }>(
      `https://store.steampowered.com/api/storesearch/?${params.toString()}`,
      LABEL,
    );

    return (data.items ?? [])
      .filter((item) => item.type === "app" && item.name && !NOT_A_GAME.test(item.name))
      .slice(0, MAX_RESULTS)
      .map(
        (item): MetadataCandidate => ({
          provider: "steam",
          externalId: String(item.id),
          title: item.name as string,
          // Portrait box art fits the cover grid; the dropdown hides it if
          // an old title has none.
          thumbnailUrl: portrait(String(item.id)),
        }),
      );
  },

  async details(id): Promise<MetadataDetails> {
    const params = new URLSearchParams({ appids: id, l: "english" });
    const response = await getJson<Record<string, AppDetails>>(
      `https://store.steampowered.com/api/appdetails?${params.toString()}`,
      LABEL,
    );
    const app = response[id];
    if (!app?.success || !app.data?.name) throw new NotFoundError(`${LABEL} entry`);

    // Older or obscure titles lack portrait art; fall back to the wide header.
    const tall = portrait(id);
    const coverUrl = (await imageExists(tall)) ? tall : app.data.header_image;

    return {
      provider: "steam",
      externalId: id,
      title: app.data.name,
      year: parseYear(app.data.release_date?.date),
      coverUrl,
      url: `https://store.steampowered.com/app/${id}`,
      credits: {},
    };
  },
};
