import { isValidObjectId, Types, type HydratedDocument, type QueryFilter } from "mongoose";
import Note, {
  type INote,
  type NoteCover,
  type NoteFontFamily,
  type NoteView,
} from "./note.model";
import NoteVersion, {
  MAX_VERSIONS_PER_NOTE,
  VERSION_INTERVAL_MS,
} from "./note-version.model";
import { escapeRegExp, excerptOf, normaliseTags, snippetAround } from "./note.text";
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
  icon: string;
  parentId: string | null;
  dailyDate?: string;
  isTemplate: boolean;
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
  icon: note.icon ?? "",
  parentId: note.parentId ? String(note.parentId) : null,
  ...(note.dailyDate ? { dailyDate: note.dailyDate } : {}),
  isTemplate: note.isTemplate ?? false,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
});

const assertId = (id: string, field = "id") => {
  if (!isValidObjectId(id)) throw new BadRequestError(`${field} is not a valid id`);
};

const findOwned = async (id: string, userId: string): Promise<NoteDoc> => {
  assertId(id);
  const note = await Note.findById(id);
  if (!note) throw new NotFoundError("Note");
  if (note.userId !== userId) throw new ForbiddenError();
  return note;
};

/** Every id under `rootId` in the page tree (not including it). */
const descendantIds = async (
  rootId: string,
  userId: string,
  filter: QueryFilter<INote> = {},
): Promise<Types.ObjectId[]> => {
  const all = await Note.find({ userId, ...filter }, { _id: 1, parentId: 1 }).lean();
  const children = new Map<string, Types.ObjectId[]>();
  for (const note of all) {
    if (!note.parentId) continue;
    const key = String(note.parentId);
    children.set(key, [...(children.get(key) ?? []), note._id]);
  }
  const result: Types.ObjectId[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const child of children.get(current) ?? []) {
      result.push(child);
      queue.push(String(child));
    }
  }
  return result;
};

/** Position after the last sibling under `parentId`. */
const nextOrder = async (userId: string, parentId: Types.ObjectId | null) => {
  const last = await Note.findOne({ userId, parentId, deletedAt: null })
    .sort({ order: -1 })
    .select("order")
    .lean();
  return (last?.order ?? 0) + 1;
};

/** Validates a new parent: owned, live, and not the note itself or one of its descendants. */
const resolveParent = async (
  parentId: string | null | undefined,
  userId: string,
  movingId?: string,
): Promise<Types.ObjectId | null> => {
  if (!parentId) return null;
  const parent = await findOwned(parentId, userId);
  if (parent.deletedAt) throw new BadRequestError("Can't nest a page under a trashed page");
  if (parent.isTemplate) throw new BadRequestError("Templates can't hold pages");
  if (movingId) {
    if (parentId === movingId) throw new BadRequestError("A page can't contain itself");
    const below = await descendantIds(movingId, userId);
    if (below.some((id) => String(id) === parentId)) {
      throw new BadRequestError("A page can't move inside one of its own sub-pages");
    }
  }
  return parent._id;
};

/**
 * Keeps the list tidy before reading it:
 * - notes written before `plainText` existed get it, without bumping
 *   `updatedAt` (so the list order doesn't change);
 * - empty notes (e.g. "New note" then straight back) are purged once stale,
 *   unless they hold sub-pages or are daily notes or templates.
 */
const housekeep = async (userId: string): Promise<void> => {
  const stale = await Note.find({ userId, plainText: { $exists: false } });
  for (const note of stale) await note.save({ timestamps: false });

  const candidates = await Note.find(
    {
      userId,
      empty: true,
      deletedAt: null,
      isTemplate: { $ne: true },
      dailyDate: { $exists: false },
      updatedAt: { $lt: new Date(Date.now() - EMPTY_NOTE_GRACE_MS) },
    },
    { _id: 1 },
  ).lean();
  if (candidates.length === 0) return;

  const parents = new Set(
    (
      await Note.distinct("parentId", {
        userId,
        parentId: { $in: candidates.map((note) => note._id) },
      })
    ).map(String),
  );
  const purge = candidates.filter((note) => !parents.has(String(note._id)));
  if (purge.length > 0) {
    await Note.deleteMany({ _id: { $in: purge.map((note) => note._id) } });
  }
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
  const filter: QueryFilter<INote> = { userId, isTemplate: { $ne: true } };

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

/** One light entry per live note: the page tree, link targets, the switcher and the graph. */
export interface NoteIndexEntry {
  _id: string;
  title: string;
  icon: string;
  parentId: string | null;
  order: number;
  pinned: boolean;
  dailyDate?: string;
  isTemplate: boolean;
  isDailyTemplate: boolean;
  empty: boolean;
  links: string[];
  updatedAt: Date;
}

export const getIndex = async (userId: string): Promise<NoteIndexEntry[]> => {
  await housekeep(userId);
  const notes = await Note.find(
    { userId, deletedAt: null, archived: { $ne: true } },
    {
      title: 1,
      icon: 1,
      parentId: 1,
      order: 1,
      pinned: 1,
      dailyDate: 1,
      isTemplate: 1,
      isDailyTemplate: 1,
      empty: 1,
      links: 1,
      updatedAt: 1,
    },
  )
    .sort({ order: 1, createdAt: 1 })
    .lean();

  return notes.map((note) => ({
    _id: String(note._id),
    title: note.title,
    icon: note.icon ?? "",
    parentId: note.parentId ? String(note.parentId) : null,
    order: note.order ?? 0,
    pinned: note.pinned ?? false,
    ...(note.dailyDate ? { dailyDate: note.dailyDate } : {}),
    isTemplate: note.isTemplate ?? false,
    isDailyTemplate: note.isDailyTemplate ?? false,
    empty: note.empty ?? false,
    links: (note.links ?? []).map(String),
    updatedAt: note.updatedAt,
  }));
};

/** Every tag in use (outside the trash), most used first. */
export const listTags = async (
  userId: string,
): Promise<Array<{ tag: string; count: number }>> =>
  Note.aggregate<{ tag: string; count: number }>([
    { $match: { userId, deletedAt: null, empty: { $ne: true }, isTemplate: { $ne: true } } },
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
  icon?: string;
  parentId?: string | null;
  /** Copy body, icon, font and tags from this template. */
  templateId?: string;
  isTemplate?: boolean;
}

export const createNote = async (
  input: CreateNoteInput,
  userId: string,
): Promise<NoteDoc> => {
  const template = input.templateId ? await findOwned(input.templateId, userId) : null;
  const isTemplate = input.isTemplate ?? false;
  const parentId = isTemplate ? null : await resolveParent(input.parentId, userId);

  return Note.create({
    title: input.title ?? "",
    content: input.content ?? template?.content ?? "",
    tags: normaliseTags(input.tags ?? template?.tags ?? []),
    fontFamily: input.fontFamily ?? template?.fontFamily ?? "sans",
    icon: input.icon ?? template?.icon ?? "",
    parentId,
    order: await nextOrder(userId, parentId),
    isTemplate,
    userId,
  });
};

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  tags?: string[];
  pinned?: boolean;
  archived?: boolean;
  fontFamily?: NoteFontFamily;
  icon?: string;
  /** `null` clears the cover. */
  cover?: NoteCover | null;
  /** `null` moves the page to the top level. */
  parentId?: string | null;
  isTemplate?: boolean;
  isDailyTemplate?: boolean;
}

/**
 * Snapshots the note as it stands before an edit, at most once per
 * `VERSION_INTERVAL_MS`, and keeps the newest `MAX_VERSIONS_PER_NOTE`.
 */
const snapshot = async (note: NoteDoc, force = false) => {
  if (note.empty) return;
  if (!force) {
    const latest = await NoteVersion.findOne({ noteId: note._id })
      .sort({ createdAt: -1 })
      .select("createdAt")
      .lean();
    if (latest && Date.now() - latest.createdAt.getTime() < VERSION_INTERVAL_MS) return;
  }
  await NoteVersion.create({
    noteId: note._id,
    userId: note.userId,
    title: note.title,
    content: note.content,
  });
  const old = await NoteVersion.find({ noteId: note._id })
    .sort({ createdAt: -1 })
    .skip(MAX_VERSIONS_PER_NOTE)
    .select("_id")
    .lean();
  if (old.length > 0) await NoteVersion.deleteMany({ _id: { $in: old.map((v) => v._id) } });
};

export const updateNote = async (
  id: string,
  userId: string,
  input: UpdateNoteInput,
): Promise<NoteDoc> => {
  const note = await findOwned(id, userId);

  const bodyChanges =
    (input.content !== undefined && input.content !== note.content) ||
    (input.title !== undefined && input.title !== note.title);
  if (bodyChanges) await snapshot(note);

  if (input.title !== undefined) note.title = input.title;
  if (input.content !== undefined) note.content = input.content;
  if (input.tags !== undefined) note.tags = normaliseTags(input.tags);
  if (input.pinned !== undefined) note.pinned = input.pinned;
  if (input.fontFamily !== undefined) note.fontFamily = input.fontFamily;
  if (input.icon !== undefined) note.icon = input.icon;
  if (input.cover !== undefined) note.cover = input.cover;

  if (input.parentId !== undefined) {
    const current = note.parentId ? String(note.parentId) : null;
    if (input.parentId !== current) {
      note.parentId = await resolveParent(input.parentId, userId, id);
      note.order = await nextOrder(userId, note.parentId ?? null);
    }
  }

  if (input.isTemplate !== undefined) {
    note.isTemplate = input.isTemplate;
    if (input.isTemplate) note.parentId = null;
    else note.isDailyTemplate = false;
  }
  if (input.isDailyTemplate !== undefined) {
    if (input.isDailyTemplate && !note.isTemplate) {
      throw new BadRequestError("Only a template can be the daily template");
    }
    if (input.isDailyTemplate) {
      await Note.updateMany(
        { userId, isDailyTemplate: true, _id: { $ne: note._id } },
        { $set: { isDailyTemplate: false } },
      );
    }
    note.isDailyTemplate = input.isDailyTemplate;
  }

  // Archiving a page archives everything under it, and back.
  if (input.archived !== undefined && input.archived !== note.archived) {
    note.archived = input.archived;
    const below = await descendantIds(id, userId, { deletedAt: null });
    if (below.length > 0) {
      await Note.updateMany({ _id: { $in: below } }, { $set: { archived: input.archived } });
    }
  }

  await note.save();
  return note;
};

/** Sets the order of a page's children (or the top level) to the order of `ids`. */
export const reorderNotes = async (
  userId: string,
  parentId: string | null,
  ids: string[],
): Promise<void> => {
  ids.forEach((id) => assertId(id, "ids"));
  if (parentId) assertId(parentId, "parentId");
  const parent = parentId ? new Types.ObjectId(parentId) : null;
  await Note.bulkWrite(
    ids.map((id, index) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(id), userId, parentId: parent },
        update: { $set: { order: index + 1 } },
        timestamps: false,
      },
    })),
  );
};

/** Copies a note's body, font, icon and tags into a new, unpinned sibling. */
export const duplicateNote = async (
  id: string,
  userId: string,
): Promise<NoteDoc> => {
  const source = await findOwned(id, userId);
  const parentId = source.parentId ?? null;
  return Note.create({
    title: `${source.title.trim() || "Untitled"} (copy)`.slice(0, 300),
    content: source.content,
    tags: source.tags,
    fontFamily: source.fontFamily,
    icon: source.icon,
    cover: source.cover ?? null,
    isTemplate: source.isTemplate,
    parentId,
    order: await nextOrder(userId, parentId),
    userId,
  });
};

/** Moves a note and its live sub-pages to the trash; MongoDB deletes them after the retention period. */
export const trashNote = async (id: string, userId: string): Promise<NoteDoc> => {
  const note = await findOwned(id, userId);
  const now = new Date();
  const below = await descendantIds(id, userId, { deletedAt: null });
  if (below.length > 0) {
    await Note.updateMany(
      { _id: { $in: below } },
      { $set: { deletedAt: now, trashedWith: note._id } },
    );
  }
  note.deletedAt = now;
  note.trashedWith = undefined;
  if (note.isDailyTemplate) note.isDailyTemplate = false;
  await note.save();
  return note;
};

/** Restores a note and the sub-pages trashed with it. A trashed parent sends it to the top level. */
export const restoreNote = async (id: string, userId: string): Promise<NoteDoc> => {
  const note = await findOwned(id, userId);
  if (note.parentId) {
    const parent = await Note.findOne({ _id: note.parentId, userId, deletedAt: null }).lean();
    if (!parent) note.parentId = null;
  }
  note.deletedAt = undefined;
  note.trashedWith = undefined;
  await note.save();
  await Note.updateMany(
    { userId, trashedWith: note._id },
    { $unset: { deletedAt: 1, trashedWith: 1 } },
  );
  return note;
};

/** Permanent delete. Only allowed from the trash, so it is always a 2nd step. */
export const deleteNote = async (id: string, userId: string): Promise<void> => {
  const note = await findOwned(id, userId);
  if (!note.deletedAt) {
    throw new BadRequestError("Move the note to the trash before deleting it");
  }
  const group = await Note.find({ userId, trashedWith: note._id }, { _id: 1 }).lean();
  const ids = [note._id, ...group.map((n) => n._id)];
  await Note.deleteMany({ _id: { $in: ids } });
  await NoteVersion.deleteMany({ noteId: { $in: ids } });
};

/* ---------- daily notes ---------- */

/** The daily note for `date`, created (from the daily template, if any) on first open. */
export const getOrCreateDaily = async (
  userId: string,
  date: string,
  title: string,
): Promise<NoteDoc> => {
  const existing = await Note.findOne({ userId, dailyDate: date });
  if (existing) {
    if (existing.deletedAt) {
      existing.deletedAt = undefined;
      existing.trashedWith = undefined;
      await existing.save();
    }
    return existing;
  }

  const template = await Note.findOne({
    userId,
    isDailyTemplate: true,
    deletedAt: null,
  }).lean();

  try {
    return await Note.create({
      title,
      content: template?.content ?? "",
      icon: template?.icon ?? "",
      fontFamily: template?.fontFamily ?? "sans",
      tags: template?.tags ?? [],
      dailyDate: date,
      userId,
    });
  } catch (error) {
    // Two tabs opening the same day at once: the other one won.
    const raced = await Note.findOne({ userId, dailyDate: date });
    if (raced) return raced;
    throw error;
  }
};

/* ---------- backlinks ---------- */

export interface BacklinkEntry {
  _id: string;
  title: string;
  icon: string;
  snippet: string;
  updatedAt: Date;
}

export interface Backlinks {
  linked: BacklinkEntry[];
  /** Notes that mention this note's title without linking it. */
  unlinked: BacklinkEntry[];
}

const MIN_TITLE_FOR_MENTIONS = 3;

export const getBacklinks = async (id: string, userId: string): Promise<Backlinks> => {
  const note = await findOwned(id, userId);
  const title = note.title.trim();
  const live = { userId, deletedAt: null, isTemplate: { $ne: true } };

  const linkedDocs = await Note.find({ ...live, links: note._id })
    .select("title icon plainText updatedAt")
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();

  const toEntry = (doc: (typeof linkedDocs)[number]): BacklinkEntry => ({
    _id: String(doc._id),
    title: doc.title,
    icon: doc.icon ?? "",
    snippet:
      (title && snippetAround(doc.plainText ?? "", title)) ||
      excerptOf(doc.plainText ?? "", 160),
    updatedAt: doc.updatedAt,
  });

  let unlinked: BacklinkEntry[] = [];
  if (title.length >= MIN_TITLE_FOR_MENTIONS) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(title)}($|[^\\p{L}\\p{N}])`, "iu");
    const linkedIds = new Set(linkedDocs.map((doc) => String(doc._id)));
    const mentioning = await Note.find({ ...live, _id: { $ne: note._id }, plainText: pattern })
      .select("title icon plainText updatedAt")
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
    unlinked = mentioning.filter((doc) => !linkedIds.has(String(doc._id))).map(toEntry);
  }

  return { linked: linkedDocs.map(toEntry), unlinked };
};

/* ---------- version history ---------- */

export interface VersionSummary {
  _id: string;
  title: string;
  excerpt: string;
  createdAt: Date;
}

export const listVersions = async (id: string, userId: string): Promise<VersionSummary[]> => {
  const note = await findOwned(id, userId);
  const versions = await NoteVersion.find({ noteId: note._id })
    .sort({ createdAt: -1 })
    .limit(MAX_VERSIONS_PER_NOTE)
    .lean();
  return versions.map((version) => ({
    _id: String(version._id),
    title: version.title,
    excerpt: excerptOf(
      version.content.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " "),
      140,
    ),
    createdAt: version.createdAt,
  }));
};

export const getVersion = async (id: string, versionId: string, userId: string) => {
  const note = await findOwned(id, userId);
  assertId(versionId, "versionId");
  const version = await NoteVersion.findOne({ _id: versionId, noteId: note._id }).lean();
  if (!version) throw new NotFoundError("Version");
  return {
    _id: String(version._id),
    title: version.title,
    content: version.content,
    createdAt: version.createdAt,
  };
};

/** Puts an old version back; the current text is saved as a version first. */
export const restoreVersion = async (
  id: string,
  versionId: string,
  userId: string,
): Promise<NoteDoc> => {
  const note = await findOwned(id, userId);
  assertId(versionId, "versionId");
  const version = await NoteVersion.findOne({ _id: versionId, noteId: note._id }).lean();
  if (!version) throw new NotFoundError("Version");
  await snapshot(note, true);
  note.title = version.title;
  note.content = version.content;
  await note.save();
  return note;
};
