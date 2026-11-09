import type { HydratedDocument } from "mongoose";
import MediaLog, {
  type IMediaLog,
  type MediaLogType,
  type MediaLogStatus,
  type CoverImage,
} from "./mediaLog.model";
import { deleteImageQuietly } from "../../core/storage";
import { ForbiddenError, NotFoundError } from "../../core/errors/AppError";

type MediaLogDoc = HydratedDocument<IMediaLog>;

/** Reads a stored cover, tolerating documents that predate the structured shape. */
export const resolveCover = (
  cover: CoverImage | string | null | undefined,
): CoverImage | undefined => {
  if (!cover) return undefined;
  if (typeof cover === "string") {
    return cover ? { url: cover, source: "external" } : undefined;
  }
  if (!cover.url) return undefined;
  return {
    url: cover.url,
    source: cover.source === "upload" ? "upload" : "external",
    ...(cover.publicId ? { publicId: cover.publicId } : {}),
  };
};

/** The Cloudinary id owned by a cover, if the cover is one we uploaded. */
const ownedPublicId = (
  cover: CoverImage | string | null | undefined,
): string | undefined => {
  const resolved = resolveCover(cover);
  return resolved?.source === "upload" ? resolved.publicId : undefined;
};

const findOwned = async (id: string, userId: string): Promise<MediaLogDoc> => {
  const log = await MediaLog.findById(id);
  if (!log) throw new NotFoundError("Media log");
  if (log.userId !== userId) throw new ForbiddenError();
  return log;
};

export const listLogs = async (
  userId: string,
  opts: { type?: MediaLogType } = {},
): Promise<MediaLogDoc[]> => {
  const filter: Record<string, unknown> = { userId };
  if (opts.type) filter.type = opts.type;
  return MediaLog.find(filter).sort({ date: -1 });
};

export interface CreateMediaLogInput {
  type: MediaLogType;
  title: string;
  rating: number;
  date: Date;
  url?: string;
  cover?: CoverImage;
  review?: string;
  status?: MediaLogStatus;
  director?: string;
  author?: string;
  pages?: number;
  artist?: string;
}

/** Type-specific credits, blanked out for types they don't apply to. */
const creditsFor = (
  type: MediaLogType,
  input: Pick<CreateMediaLogInput, "director" | "author" | "pages" | "artist">,
) => ({
  director: type === "movie" ? input.director : undefined,
  author: type === "book" ? input.author : undefined,
  pages: type === "book" ? input.pages : undefined,
  artist: type === "music_album" ? input.artist : undefined,
});

export const createLog = async (
  input: CreateMediaLogInput,
  userId: string,
): Promise<MediaLogDoc> =>
  MediaLog.create({
    type: input.type,
    title: input.title,
    url: input.url,
    cover: resolveCover(input.cover),
    rating: input.rating,
    review: input.review,
    date: input.date,
    status: input.status ?? "finished",
    ...creditsFor(input.type, input),
    userId,
  });

export interface UpdateMediaLogInput
  extends Partial<Omit<CreateMediaLogInput, "cover">> {
  /** `null` clears the cover; `undefined` leaves it unchanged. */
  cover?: CoverImage | null;
}

export const updateLog = async (
  id: string,
  userId: string,
  input: UpdateMediaLogInput,
): Promise<MediaLogDoc> => {
  const log = await findOwned(id, userId);

  if (input.type !== undefined) log.type = input.type;
  if (input.title !== undefined) log.title = input.title;
  if (input.url !== undefined) log.url = input.url || undefined;
  if (input.rating !== undefined) log.rating = input.rating;
  if (input.review !== undefined) log.review = input.review || undefined;
  if (input.date !== undefined) log.date = input.date;
  if (input.status !== undefined) log.status = input.status;

  if (input.cover !== undefined) {
    // Replacing or clearing an uploaded cover orphans its Cloudinary asset, so
    // clean it up here rather than trusting each client to do it.
    const previousId = ownedPublicId(log.cover);
    const nextId = ownedPublicId(input.cover);
    if (previousId && previousId !== nextId) {
      await deleteImageQuietly(previousId);
    }
    log.cover = input.cover === null ? undefined : resolveCover(input.cover);
    log.markModified("cover");
  }

  // Credits follow the (possibly updated) type: fields that don't apply to the
  // current type are cleared, so switching a book to a movie can't leave a
  // stale author behind.
  const credits = creditsFor(log.type, {
    director: input.director ?? log.director,
    author: input.author ?? log.author,
    pages: input.pages ?? log.pages,
    artist: input.artist ?? log.artist,
  });
  log.director = credits.director || undefined;
  log.author = credits.author || undefined;
  log.pages = credits.pages;
  log.artist = credits.artist || undefined;

  await log.save();
  return log;
};

export const toggleFavorite = async (
  id: string,
  userId: string,
): Promise<MediaLogDoc> => {
  const log = await findOwned(id, userId);
  log.favorite = !log.favorite;
  await log.save();
  return log;
};

export const deleteLog = async (id: string, userId: string): Promise<void> => {
  const log = await findOwned(id, userId);
  // Delete the document first: a failed Cloudinary call must not block the
  // delete the user asked for, and `deleteImageQuietly` only logs on failure.
  await log.deleteOne();
  await deleteImageQuietly(ownedPublicId(log.cover));
};
