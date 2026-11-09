import { getUserId } from "../../core/auth";
import {
  asRequiredString,
  asString,
  asNumber,
  asDate,
  asEnum,
  asyncHandler,
  supplied,
} from "../../core/http";
import { BadRequestError } from "../../core/errors/AppError";
import {
  MEDIA_LOG_TYPES,
  MEDIA_LOG_STATUSES,
  COVER_SOURCES,
  type CoverImage,
} from "./mediaLog.model";
import * as MediaService from "./media.service";

/** Accepts either the structured cover or a bare URL string from older clients. */
const parseCover = (value: unknown): CoverImage | null => {
  if (value === null || value === "") return null;
  if (typeof value === "string") return { url: value, source: "external" };
  if (typeof value !== "object") {
    throw new BadRequestError("cover must be an object, a URL string, or null");
  }

  const c = value as Record<string, unknown>;
  const url = asString(c.url, "cover.url");
  if (!url) return null;

  const source = asEnum(c.source, "cover.source", COVER_SOURCES) ?? "external";
  const publicId = asString(c.publicId, "cover.publicId");
  return { url, source, ...(publicId ? { publicId } : {}) };
};

const parseCredits = (b: Record<string, unknown>) => ({
  director: asString(b.director, "director", { maxLength: 200 }),
  author: asString(b.author, "author", { maxLength: 200 }),
  pages: asNumber(b.pages, "pages", { min: 1, integer: true }),
  artist: asString(b.artist, "artist", { maxLength: 200 }),
});

export const listMediaLogs = asyncHandler(async (req, res) => {
  const logs = await MediaService.listLogs(getUserId(req), {
    type: asEnum(req.query.type, "type", MEDIA_LOG_TYPES),
  });
  res.status(200).json(logs);
});

export const createMediaLog = asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;

  const type = asEnum(b.type, "type", MEDIA_LOG_TYPES);
  if (!type) throw new BadRequestError("type is required");

  const rating = asNumber(b.rating, "rating", { min: 1, max: 10 });
  if (rating === undefined) throw new BadRequestError("rating is required");

  const log = await MediaService.createLog(
    {
      type,
      title: asRequiredString(b.title, "title", { maxLength: 300 }),
      rating,
      date: asDate(b.date, "date") ?? new Date(),
      url: asString(b.url, "url", { maxLength: 2000 }),
      cover: parseCover(b.cover) ?? undefined,
      review: asString(b.review, "review", { maxLength: 10_000 }),
      status: asEnum(b.status, "status", MEDIA_LOG_STATUSES),
      ...parseCredits(b),
    },
    getUserId(req),
  );
  res.status(201).json(log);
});

export const updateMediaLog = asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;

  const log = await MediaService.updateLog(
    String(req.params.id),
    getUserId(req),
    {
      type: asEnum(b.type, "type", MEDIA_LOG_TYPES),
      title: asString(b.title, "title", { maxLength: 300 }) || undefined,
      rating: asNumber(b.rating, "rating", { min: 1, max: 10 }),
      date: asDate(b.date, "date"),
      url: asString(b.url, "url", { maxLength: 2000 }),
      // Only touch the cover when the client actually sent the key, so a
      // partial update can't silently delete an existing image.
      ...(supplied(b, "cover") ? { cover: parseCover(b.cover) } : {}),
      review: asString(b.review, "review", { maxLength: 10_000 }),
      status: asEnum(b.status, "status", MEDIA_LOG_STATUSES),
      ...parseCredits(b),
    },
  );
  res.status(200).json(log);
});

export const toggleFavorite = asyncHandler(async (req, res) => {
  const log = await MediaService.toggleFavorite(
    String(req.params.id),
    getUserId(req),
  );
  res.status(200).json(log);
});

export const deleteMediaLog = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  await MediaService.deleteLog(id, getUserId(req));
  res.status(200).json({ id, message: "Media log deleted" });
});
