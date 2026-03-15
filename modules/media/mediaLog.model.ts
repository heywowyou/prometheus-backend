import { Schema, model, type Document, type Model } from "mongoose";

export type MediaLogType =
  | "movie"
  | "tvshow"
  | "book"
  | "music_album"
  | "game";

export interface MediaLogDocument extends Document {
  type: MediaLogType;
  title: string;
  url?: string;
  cover?: string;
  rating: number; // 1–10
  review?: string;
  date: Date;
  status: "finished" | "in_progress";
  director?: string;
  author?: string;
  pages?: number;
  artist?: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

const MediaLogSchema = new Schema<MediaLogDocument>(
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
    cover: { type: String, trim: true },
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
    userId: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

// Index for listing by user, newest first
MediaLogSchema.index({ userId: 1, createdAt: -1 });
// Index for listing by user and type, newest first
MediaLogSchema.index({ userId: 1, type: 1, createdAt: -1 });

const MediaLog: Model<MediaLogDocument> = model<MediaLogDocument>(
  "MediaLog",
  MediaLogSchema
);

export default MediaLog;
