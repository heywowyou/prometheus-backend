import { NotFoundError } from "../../../core/errors/AppError";
import { getJson, MAX_RESULTS } from "../http";
import type {
  MetadataAdapter,
  MetadataCandidate,
  MetadataDetails,
} from "../metadata.types";

const LABEL = "Open Library";
const FIELDS = "key,title,author_name,first_publish_year,cover_i,number_of_pages_median";

interface OpenLibraryDoc {
  /** "/works/OL893414W" */
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  number_of_pages_median?: number;
}

const search = async (q: string, limit: number): Promise<OpenLibraryDoc[]> => {
  const query = new URLSearchParams({ q, limit: String(limit), fields: FIELDS });
  const data = await getJson<{ docs?: OpenLibraryDoc[] }>(
    `https://openlibrary.org/search.json?${query.toString()}`,
    LABEL,
  );
  return data.docs ?? [];
};

const workId = (doc: OpenLibraryDoc) => doc.key?.replace("/works/", "") ?? "";

const cover = (doc: OpenLibraryDoc, size: "M" | "L") =>
  doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-${size}.jpg` : undefined;

/** Open Library — no key needed. Search results already carry every field. */
export const openLibrary: MetadataAdapter = {
  provider: "openlibrary",
  label: LABEL,
  idPattern: /^OL\d{1,12}W$/,

  async search(query) {
    const docs = await search(query, MAX_RESULTS);
    return docs
      .filter((doc) => doc.key && doc.title)
      .map(
        (doc): MetadataCandidate => ({
          provider: "openlibrary",
          externalId: workId(doc),
          title: doc.title as string,
          year: doc.first_publish_year,
          subtitle: doc.author_name?.join(", "),
          thumbnailUrl: cover(doc, "M"),
        }),
      );
  },

  async details(id): Promise<MetadataDetails> {
    // A key query returns the same fields as search, including the median
    // page count that the works endpoint doesn't have.
    const [doc] = await search(`key:/works/${id}`, 1);
    if (!doc?.title) throw new NotFoundError(`${LABEL} entry`);

    return {
      provider: "openlibrary",
      externalId: id,
      title: doc.title,
      year: doc.first_publish_year,
      coverUrl: cover(doc, "L"),
      url: `https://openlibrary.org/works/${id}`,
      credits: {
        author: doc.author_name?.join(", "),
        pages: doc.number_of_pages_median,
      },
    };
  },
};
