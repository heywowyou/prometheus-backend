import { Schema, model } from "mongoose";

export interface INote {
  title: string;
  content: string;
  userId: string;
  pinned: boolean;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NoteSchema = new Schema<INote>(
  {
    title: {
      type: String,
      default: "",
      trim: true,
    },
    content: {
      type: String,
      default: "",
    },
    userId: {
      type: String,
      required: true,
    },
    pinned: {
      type: Boolean,
      default: false,
    },
    archived: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

NoteSchema.index({ userId: 1, archived: 1, pinned: -1, updatedAt: -1 });

const Note = model<INote>("Note", NoteSchema);

export default Note;
