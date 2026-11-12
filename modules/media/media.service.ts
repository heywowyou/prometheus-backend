import type { HydratedDocument } from "mongoose";
import MediaLog, {
  type IMediaLog,
  type MediaLogType,
  type MediaLogStatus,
  type CoverImage,
} from "./mediaLog.model";
import { deleteImageQuietly, importRemoteImage } from "../../core/storage";
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from "../../core/errors/AppError";
import logger from "../../core/logger";
import type { ExternalRef } from "../metadata/metadata.types";

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

/**
 * Makes a cover safe to store: an external URL (pasted, or offered by the
 * metadata search) is copied into Cloudinary so it can't break later.
 *
 * Importing happens here, on save, rather than when the user picks the image,
 * so cancelling the form never leaves an orphaned upload behind. A cover whose
 * URL matches the one already stored is kept as is, so editing an old log
 * doesn't re-download (or fail on) a legacy external link.
 */
const storeCover = async (
  cover: CoverImage | undefined,
  current?: CoverImage,
): Promise<{ cover: CoverImage | undefined; imported: boolean }> => {
  if (!cover || cover.source !== "external") return { cover, imported: false };
  if (current && current.url === cover.url) return { cover: current, imported: false };

  try {
    const stored = await importRemoteImage(cover.url);
    return {
      cover: { url: stored.url, source: "upload", publicId: stored.publicId },
      imported: true,
    };
  } catch (error) {
    if (!(error instanceof AppError)) logger.error("Cover import failed", error);
    const reason = error instanceof AppError ? `: ${error.message}` : "";
    throw new UnprocessableEntityError(`Couldn't import the cover image${reason}`);
  }
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
  rating?: number;
  date: Date;
  url?: string;
  cover?: CoverImage;
  review?: string;
  status?: MediaLogStatus;
  director?: string;
  author?: string;
  pages?: number;
  artist?: string;
  releaseYear?: number;
  external?: ExternalRef;
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
): Promise<MediaLogDoc> => {
  const { cover, imported } = await storeCover(resolveCover(input.cover));

  try {
    return await MediaLog.create({
      type: input.type,
      title: input.title,
      url: input.url,
      cover,
      rating: input.rating,
      review: input.review,
      date: input.date,
      status: input.status ?? "finished",
      releaseYear: input.releaseYear,
      external: input.external,
      ...creditsFor(input.type, input),
      userId,
    });
  } catch (error) {
    // Don't keep an image for a log that was never written.
    if (imported) await deleteImageQuietly(cover?.publicId);
    throw error;
  }
};

export interface UpdateMediaLogInput
  extends Partial<
    Omit<CreateMediaLogInput, "cover" | "releaseYear" | "external" | "rating">
  > {
  /** `null` clears the rating; `undefined` leaves it unchanged. */
  rating?: number | null;
  /** `null` clears the cover; `undefined` leaves it unchanged. */
  cover?: CoverImage | null;
  /** `null` clears the field; `undefined` leaves it unchanged. */
  releaseYear?: number | null;
  /** `null` unlinks the log from its catalogue entry. */
  external?: ExternalRef | null;
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
  if (input.rating !== undefined) log.rating = input.rating ?? undefined;
  if (input.review !== undefined) log.review = input.review || undefined;
  if (input.date !== undefined) log.date = input.date;
  if (input.status !== undefined) log.status = input.status;
  if (input.releaseYear !== undefined) {
    log.releaseYear = input.releaseYear ?? undefined;
  }
  if (input.external !== undefined) log.external = input.external ?? undefined;

  if (input.cover !== undefined) {
    const current = resolveCover(log.cover);
    const { cover: next } =
      input.cover === null
        ? { cover: undefined }
        : await storeCover(resolveCover(input.cover), current);

    // Replacing or clearing an uploaded cover orphans its Cloudinary asset, so
    // clean it up here rather than trusting each client to do it.
    const previousId = ownedPublicId(current);
    if (previousId && previousId !== ownedPublicId(next)) {
      await deleteImageQuietly(previousId);
    }
    log.cover = next;
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
