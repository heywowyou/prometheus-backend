import { Schema, model, type Model } from "mongoose";
import type { UserItemBase } from "../../core/domain";
import { htmlToText, isEmptyNote } from "./note.text";

export const NOTE_FONT_FAMILIES = ["sans", "serif"] as const;
export type NoteFontFamily = (typeof NOTE_FONT_FAMILIES)[number];

export const NOTE_VIEWS = ["active", "archived", "trash"] as const;
export type NoteView = (typeof NOTE_VIEWS)[number];

/** How long a trashed note is kept before MongoDB deletes it. */
export const TRASH_RETENTION_DAYS = 30;

export interface INote extends UserItemBase {
  title: string;
  /** Tiptap HTML. */
  content: string;
  /**
   * Plain text derived from `content` on every save — never written by
   * clients. Backs search, list previews and word counts.
   */
  plainText: string;
  /** Derived: no title, no text, no images. Empty notes are hidden and purged. */
  empty: boolean;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  /** Set while the note is in the trash. */
  deletedAt?: Date;
  fontFamily: NoteFontFamily;
}

const NoteSchema = new Schema<INote>(
  {
    title: {
      type: String,
      default: "",
      trim: true,
      maxlength: [300, "Title must be at most 300 characters"],
    },
    content: { type: String, default: "" },
    plainText: { type: String, default: "" },
    empty: { type: Boolean, default: true },
    tags: { type: [String], default: [] },
    userId: { type: String, required: true },
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    deletedAt: { type: Date },
    fontFamily: {
      type: String,
      enum: NOTE_FONT_FAMILIES,
      default: "sans",
    },
  },
  { timestamps: true },
);

// Derived fields are recomputed on every save, from every code path. Older
// documents predate them, and Mongoose would otherwise hydrate `empty` with
// its default and hide a real note the next time it was saved.
NoteSchema.pre("save", function deriveText() {
  this.plainText = htmlToText(this.content ?? "");
  this.empty = isEmptyNote(this.title ?? "", this.content ?? "", this.plainText);
});

// Serves the dashboard listing: a user's unarchived notes, pinned first.
NoteSchema.index({ userId: 1, archived: 1, pinned: -1, updatedAt: -1 });
// Tag filter and the tag list.
NoteSchema.index({ userId: 1, tags: 1 });
// Empties the trash: MongoDB removes a note 30 days after it was trashed.
// Notes without `deletedAt` are never touched by a TTL index.
NoteSchema.index(
  { deletedAt: 1 },
  { expireAfterSeconds: TRASH_RETENTION_DAYS * 24 * 60 * 60 },
);

const Note: Model<INote> = model<INote>("Note", NoteSchema);

export default Note;
