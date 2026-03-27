import { Schema, model } from "mongoose";

export type MediaLogType =
  | "movie"
  | "tvshow"
  | "book"
  | "music_album"
  | "game";

export interface CoverImage {
  url: string;
  source: "upload" | "external";
  publicId?: string;
}

export interface IMediaLog {
  type: MediaLogType;
  title: string;
  url?: string;
  /** Structured cover. Legacy documents may still hold a plain string. */
  cover?: CoverImage | string;
  rating: number; // 1–10
  review?: string;
  date: Date;
  status: "finished" | "in_progress";
  director?: string;
  author?: string;
  pages?: number;
  artist?: string;
  favorite: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

const MediaLogSchema = new Schema<IMediaLog>(
  {
    type: {
      type: String,
      required: true,
      enum: ["movie", "tvshow", "book", "music_album", "game"],
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    url: { type: String, trim: true },
    cover: { type: Schema.Types.Mixed },
    rating: {
      type: Number,
      required: true,
      min: [1, "Rating must be at least 1"],
      max: [10, "Rating must be at most 10"],
    },
    review: {
      type: String,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["finished", "in_progress"],
      default: "finished",
    },
    director: {
      type: String,
      trim: true,
    },
    author: {
      type: String,
      trim: true,
    },
    pages: {
      type: Number,
      min: 1,
    },
    artist: {
      type: String,
      trim: true,
    },
    favorite: {
      type: Boolean,
      default: false,
    },
    userId: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

// Index for listing by user, sorted by consumed date
MediaLogSchema.index({ userId: 1, date: -1 });
// Index for listing by user and type, sorted by consumed date
MediaLogSchema.index({ userId: 1, type: 1, date: -1 });

const MediaLog = model<IMediaLog>("MediaLog", MediaLogSchema);

export default MediaLog;
