import { Schema, Types, model, type Model } from "mongoose";
import type { UserItemBase } from "../../core/domain";
import { extractNoteLinks, htmlToText, isEmptyNote } from "./note.text";

export const NOTE_FONT_FAMILIES = ["sans", "serif"] as const;
export type NoteFontFamily = (typeof NOTE_FONT_FAMILIES)[number];

export const NOTE_VIEWS = ["active", "archived", "trash"] as const;
export type NoteView = (typeof NOTE_VIEWS)[number];

/** How long a trashed note is kept before MongoDB deletes it. */
export const TRASH_RETENTION_DAYS = 30;

/** `YYYY-MM-DD`, the calendar day a daily note belongs to. */
export const DAILY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface NoteCover {
  url: string;
  /** Cloudinary id, present for uploaded covers. */
  publicId?: string;
}

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
  /** Shown under Favorites. */
  pinned: boolean;
  archived: boolean;
  /** Set while the note is in the trash. */
  deletedAt?: Date;
  /** The note whose trashing took this one with it; restoring it brings this back. */
  trashedWith?: Types.ObjectId;
  fontFamily: NoteFontFamily;
  /** The page this one is nested under; null at the top level. */
  parentId?: Types.ObjectId | null;
  /** Position among its siblings, ascending. */
  order: number;
  /** A Lucide icon name (older pages: an emoji) shown before the title. */
  icon: string;
  cover?: NoteCover | null;
  /** Set on a daily note: the day it belongs to. Unique per user. */
  dailyDate?: string;
  /** Templates live apart from the page tree and are copied into new pages. */
  isTemplate: boolean;
  /** The template a new daily note starts from (at most one per user). */
  isDailyTemplate: boolean;
  /** Derived: ids of the notes this one links to. Backs backlinks and the graph. */
  links: Types.ObjectId[];
}

const CoverSchema = new Schema<NoteCover>(
  {
    url: { type: String, required: true, maxlength: 2000 },
    publicId: { type: String },
  },
  { _id: false },
);

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
    trashedWith: { type: Schema.Types.ObjectId },
    fontFamily: {
      type: String,
      enum: NOTE_FONT_FAMILIES,
      default: "sans",
    },
    parentId: { type: Schema.Types.ObjectId, default: null },
    order: { type: Number, default: 0 },
    icon: { type: String, default: "", maxlength: 60 },
    cover: { type: CoverSchema, default: null },
    dailyDate: { type: String, match: DAILY_DATE_PATTERN },
    isTemplate: { type: Boolean, default: false },
    isDailyTemplate: { type: Boolean, default: false },
    links: { type: [Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true },
);

// Derived fields are recomputed on every save, from every code path. Older
// documents predate them, and Mongoose would otherwise hydrate `empty` with
// its default and hide a real note the next time it was saved.
NoteSchema.pre("save", function deriveText() {
  this.plainText = htmlToText(this.content ?? "");
  this.empty = isEmptyNote(this.title ?? "", this.content ?? "", this.plainText);
  const self = String(this._id);
  this.links = extractNoteLinks(this.content ?? "")
    .filter((id) => id !== self)
    .map((id) => new Types.ObjectId(id));
});

// Serves the dashboard listing: a user's unarchived notes, pinned first.
NoteSchema.index({ userId: 1, archived: 1, pinned: -1, updatedAt: -1 });
// Tag filter and the tag list.
NoteSchema.index({ userId: 1, tags: 1 });
// The page tree: children of a page, in order.
NoteSchema.index({ userId: 1, parentId: 1, order: 1 });
// Backlinks: notes linking to a given note.
NoteSchema.index({ userId: 1, links: 1 });
// One daily note per day.
NoteSchema.index(
  { userId: 1, dailyDate: 1 },
  { unique: true, partialFilterExpression: { dailyDate: { $type: "string" } } },
);
// Empties the trash: MongoDB removes a note 30 days after it was trashed.
// Notes without `deletedAt` are never touched by a TTL index.
NoteSchema.index(
  { deletedAt: 1 },
  { expireAfterSeconds: TRASH_RETENTION_DAYS * 24 * 60 * 60 },
);

const Note: Model<INote> = model<INote>("Note", NoteSchema);

export default Note;
