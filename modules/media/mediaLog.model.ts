import { Schema, model, type Model } from "mongoose";
import type { UserItemBase } from "../../core/domain";

export const MEDIA_LOG_TYPES = [
  "movie",
  "tvshow",
  "book",
  "music_album",
  "game",
] as const;
export type MediaLogType = (typeof MEDIA_LOG_TYPES)[number];

export const MEDIA_LOG_STATUSES = ["finished", "in_progress"] as const;
export type MediaLogStatus = (typeof MEDIA_LOG_STATUSES)[number];

export const COVER_SOURCES = ["upload", "external"] as const;
export type CoverSource = (typeof COVER_SOURCES)[number];

export interface CoverImage {
  url: string;
  source: CoverSource;
  /** Cloudinary id, present only for `source: "upload"`. */
  publicId?: string;
}

export interface IMediaLog extends UserItemBase {
  type: MediaLogType;
  title: string;
  url?: string;
  /** Structured cover. Documents written before the cover refactor may still
   *  hold a plain URL string; read them through `resolveCover`. */
  cover?: CoverImage | string;
  rating: number;
  review?: string;
  date: Date;
  status: MediaLogStatus;
  director?: string;
  author?: string;
  pages?: number;
  artist?: string;
  favorite: boolean;
}

const MediaLogSchema = new Schema<IMediaLog>(
  {
    type: { type: String, required: true, enum: MEDIA_LOG_TYPES },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [300, "Title must be at most 300 characters"],
    },
    url: { type: String, trim: true },
    cover: { type: Schema.Types.Mixed },
    rating: {
      type: Number,
      required: true,
      min: [1, "Rating must be at least 1"],
      max: [10, "Rating must be at most 10"],
    },
    review: { type: String, trim: true, maxlength: 10_000 },
    date: { type: Date, required: true },
    status: { type: String, enum: MEDIA_LOG_STATUSES, default: "finished" },
    director: { type: String, trim: true },
    author: { type: String, trim: true },
    pages: { type: Number, min: 1 },
    artist: { type: String, trim: true },
    favorite: { type: Boolean, default: false },
    userId: { type: String, required: true },
  },
  { timestamps: true },
);

// Listing by user, newest consumed first.
MediaLogSchema.index({ userId: 1, date: -1 });
// Listing one panel (movies, books, …) for a user.
MediaLogSchema.index({ userId: 1, type: 1, date: -1 });

const MediaLog: Model<IMediaLog> = model<IMediaLog>("MediaLog", MediaLogSchema);

export default MediaLog;
