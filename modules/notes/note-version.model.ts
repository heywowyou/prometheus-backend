import { Schema, model, type Model, type Types } from "mongoose";

/** How many past versions a note keeps; older ones are dropped. */
export const MAX_VERSIONS_PER_NOTE = 50;

/** A snapshot is taken at most this often while a note is being edited. */
export const VERSION_INTERVAL_MS = 10 * 60_000;

export interface INoteVersion {
  noteId: Types.ObjectId;
  userId: string;
  title: string;
  /** Tiptap HTML as it was. */
  content: string;
  createdAt: Date;
}

const NoteVersionSchema = new Schema<INoteVersion>(
  {
    noteId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: String, required: true },
    title: { type: String, default: "" },
    content: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

NoteVersionSchema.index({ noteId: 1, createdAt: -1 });

const NoteVersion: Model<INoteVersion> = model<INoteVersion>(
  "NoteVersion",
  NoteVersionSchema,
);

export default NoteVersion;
