import { Schema, model, type Model } from "mongoose";
import type { UserItemBase } from "../../core/domain";

export const NOTE_FONT_FAMILIES = ["sans", "serif"] as const;
export type NoteFontFamily = (typeof NOTE_FONT_FAMILIES)[number];

export interface INote extends UserItemBase {
  title: string;
  /** Tiptap HTML. */
  content: string;
  pinned: boolean;
  archived: boolean;
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
    userId: { type: String, required: true },
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    fontFamily: {
      type: String,
      enum: NOTE_FONT_FAMILIES,
      default: "sans",
    },
  },
  { timestamps: true },
);

// Serves the dashboard listing: a user's unarchived notes, pinned first.
NoteSchema.index({ userId: 1, archived: 1, pinned: -1, updatedAt: -1 });

const Note: Model<INote> = model<INote>("Note", NoteSchema);

export default Note;
