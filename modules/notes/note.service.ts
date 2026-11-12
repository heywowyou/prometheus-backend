import type { HydratedDocument, QueryFilter } from "mongoose";
import Note, {
  type INote,
  type NoteFontFamily,
  type NoteView,
} from "./note.model";
import { escapeRegExp, excerptOf, normaliseTags } from "./note.text";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors/AppError";

type NoteDoc = HydratedDocument<INote>;

/** Empty notes older than this are deleted the next time the list loads. */
const EMPTY_NOTE_GRACE_MS = 60 * 60_000;

/** The list shape: everything but the body, plus a short plain-text excerpt. */
export interface NoteSummary {
  _id: string;
  title: string;
  excerpt: string;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  deletedAt?: Date;
  fontFamily: NoteFontFamily;
  createdAt: Date;
  updatedAt: Date;
}

const toSummary = (note: NoteDoc): NoteSummary => ({
  _id: String(note._id),
  title: note.title,
  excerpt: excerptOf(note.plainText ?? ""),
  tags: note.tags ?? [],
  pinned: note.pinned,
  archived: note.archived,
  ...(note.deletedAt ? { deletedAt: note.deletedAt } : {}),
  fontFamily: note.fontFamily ?? "sans",
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
});

const findOwned = async (id: string, userId: string): Promise<NoteDoc> => {
  const note = await Note.findById(id);
  if (!note) throw new NotFoundError("Note");
  if (note.userId !== userId) throw new ForbiddenError();
  return note;
};

/**
 * Keeps the list tidy before reading it:
 * - notes written before `plainText` existed get it, without bumping
 *   `updatedAt` (so the list order doesn't change);
 * - empty notes (e.g. "New note" then straight back) are purged once stale.
 */
const housekeep = async (userId: string): Promise<void> => {
  const stale = await Note.find({ userId, plainText: { $exists: false } });
  for (const note of stale) await note.save({ timestamps: false });

  await Note.deleteMany({
    userId,
    empty: true,
    deletedAt: null,
    updatedAt: { $lt: new Date(Date.now() - EMPTY_NOTE_GRACE_MS) },
  });
};

export interface ListNotesOptions {
  view?: NoteView;
  /** Case-insensitive match on title or body text. */
  query?: string;
  tag?: string;
}

export const listNotes = async (
  userId: string,
  opts: ListNotesOptions = {},
): Promise<NoteSummary[]> => {
  await housekeep(userId);

  const view = opts.view ?? "active";
  const filter: QueryFilter<INote> = { userId };

  if (view === "trash") {
    filter.deletedAt = { $ne: null };
  } else {
    filter.deletedAt = null;
    filter.archived = view === "archived" ? true : { $ne: true };
    // Fresh empty notes stay hidden until they get some content.
    filter.empty = { $ne: true };
  }

  const query = opts.query?.trim();
  if (query) {
    const pattern = new RegExp(escapeRegExp(query), "i");
    filter.$or = [{ title: pattern }, { plainText: pattern }];
  }
  if (opts.tag) filter.tags = opts.tag;

  const notes = await Note.find(filter)
    .select("-content")
    .sort(view === "trash" ? { deletedAt: -1 } : { pinned: -1, updatedAt: -1 });

  return notes.map(toSummary);
};

/** Every tag in use (outside the trash), most used first. */
export const listTags = async (
  userId: string,
): Promise<Array<{ tag: string; count: number }>> =>
  Note.aggregate<{ tag: string; count: number }>([
    { $match: { userId, deletedAt: null, empty: { $ne: true } } },
    { $unwind: "$tags" },
    { $group: { _id: "$tags", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $project: { _id: 0, tag: "$_id", count: 1 } },
  ]);

/** A single note, including one in the trash (the editor shows a banner). */
export const getNote = async (id: string, userId: string): Promise<NoteDoc> =>
  findOwned(id, userId);

export interface CreateNoteInput {
  title?: string;
  content?: string;
  tags?: string[];
  fontFamily?: NoteFontFamily;
}

export const createNote = async (
  input: CreateNoteInput,
  userId: string,
): Promise<NoteDoc> =>
  Note.create({
    title: input.title ?? "",
    content: input.content ?? "",
    tags: normaliseTags(input.tags ?? []),
    fontFamily: input.fontFamily ?? "sans",
    userId,
  });

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  tags?: string[];
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
  if (input.tags !== undefined) note.tags = normaliseTags(input.tags);
  if (input.pinned !== undefined) note.pinned = input.pinned;
  if (input.archived !== undefined) note.archived = input.archived;
  if (input.fontFamily !== undefined) note.fontFamily = input.fontFamily;

  await note.save();
  return note;
};

/** Copies a note's body, font and tags into a new, unpinned note. */
export const duplicateNote = async (
  id: string,
  userId: string,
): Promise<NoteDoc> => {
  const source = await findOwned(id, userId);
  return Note.create({
    title: `${source.title.trim() || "Untitled"} (copy)`.slice(0, 300),
    content: source.content,
    tags: source.tags,
    fontFamily: source.fontFamily,
    userId,
  });
};

/** Moves a note to the trash; MongoDB deletes it after the retention period. */
export const trashNote = async (id: string, userId: string): Promise<NoteDoc> => {
  const note = await findOwned(id, userId);
  note.deletedAt = new Date();
  await note.save();
  return note;
};

export const restoreNote = async (id: string, userId: string): Promise<NoteDoc> => {
  const note = await findOwned(id, userId);
  note.deletedAt = undefined;
  await note.save();
  return note;
};

/** Permanent delete. Only allowed from the trash, so it is always a 2nd step. */
export const deleteNote = async (id: string, userId: string): Promise<void> => {
  const note = await findOwned(id, userId);
  if (!note.deletedAt) {
    throw new BadRequestError("Move the note to the trash before deleting it");
  }
  await note.deleteOne();
};
