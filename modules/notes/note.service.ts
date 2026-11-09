import type { HydratedDocument } from "mongoose";
import Note, { type INote, type NoteFontFamily } from "./note.model";
import { ForbiddenError, NotFoundError } from "../../core/errors/AppError";

type NoteDoc = HydratedDocument<INote>;

const findOwned = async (id: string, userId: string): Promise<NoteDoc> => {
  const note = await Note.findById(id);
  if (!note) throw new NotFoundError("Note");
  if (note.userId !== userId) throw new ForbiddenError();
  return note;
};

export const listNotes = async (
  userId: string,
  opts: { archived?: boolean } = {},
): Promise<NoteDoc[]> =>
  Note.find({ userId, archived: opts.archived ?? false }).sort({
    pinned: -1,
    updatedAt: -1,
  });

export const getNote = async (id: string, userId: string): Promise<NoteDoc> =>
  findOwned(id, userId);

export interface CreateNoteInput {
  title?: string;
  content?: string;
}

export const createNote = async (
  input: CreateNoteInput,
  userId: string,
): Promise<NoteDoc> =>
  Note.create({
    title: input.title ?? "",
    content: input.content ?? "",
    userId,
  });

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  pinned?: boolean;
  archived?: boolean;
  fontFamily?: NoteFontFamily;
}

export const updateNote = async (
  id: string,
  userId: string,
  input: UpdateNoteInput,
): Promise<NoteDoc> => {
  const note = await findOwned(id, userId);

  if (input.title !== undefined) note.title = input.title;
  if (input.content !== undefined) note.content = input.content;
  if (input.pinned !== undefined) note.pinned = input.pinned;
  if (input.archived !== undefined) note.archived = input.archived;
  if (input.fontFamily !== undefined) note.fontFamily = input.fontFamily;

  await note.save();
  return note;
};

export const deleteNote = async (id: string, userId: string): Promise<void> => {
  const note = await findOwned(id, userId);
  await note.deleteOne();
};
