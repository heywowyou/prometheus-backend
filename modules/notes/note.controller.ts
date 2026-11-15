import { getUserId } from "../../core/auth";
import {
  asString,
  asBoolean,
  asEnum,
  asyncHandler,
  supplied,
} from "../../core/http";
import { BadRequestError } from "../../core/errors/AppError";
import {
  DAILY_DATE_PATTERN,
  NOTE_FONT_FAMILIES,
  NOTE_VIEWS,
  type NoteCover,
} from "./note.model";
import * as NoteService from "./note.service";

const parseTags = (value: unknown): string[] | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new BadRequestError("tags must be an array");
  return value.map((tag, index) => asString(tag, `tags[${index}]`, { maxLength: 60 }) ?? "");
};

/** `null` or "" clears the cover; absent leaves it alone. */
const parseCover = (value: unknown): NoteCover | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "object") throw new BadRequestError("cover must be an object or null");
  const c = value as Record<string, unknown>;
  const url = asString(c.url, "cover.url", { maxLength: 2000 });
  if (!url) return null;
  if (!/^(https:\/\/|linear-gradient\()/.test(url)) {
    throw new BadRequestError("cover.url must be an https URL or a gradient");
  }
  const publicId = asString(c.publicId, "cover.publicId", { maxLength: 300 });
  return { url, ...(publicId ? { publicId } : {}) };
};

/** A string id, `null` for the top level, or undefined when absent. */
const parseParentId = (body: Record<string, unknown>): string | null | undefined => {
  if (!supplied(body, "parentId")) return undefined;
  if (body.parentId === null || body.parentId === "") return null;
  return asString(body.parentId, "parentId", { maxLength: 24 });
};

const parseFields = (b: Record<string, unknown>) => ({
  title: asString(b.title, "title", { maxLength: 300 }),
  // Note bodies keep their leading whitespace.
  content: asString(b.content, "content", { trim: false }),
  tags: parseTags(b.tags),
  fontFamily: asEnum(b.fontFamily, "fontFamily", NOTE_FONT_FAMILIES),
  icon: asString(b.icon, "icon", { maxLength: 16 }),
});

export const listNotes = asyncHandler(async (req, res) => {
  const view =
    asEnum(req.query.view, "view", NOTE_VIEWS) ??
    // Older clients asked for the archive with ?archived=true.
    (req.query.archived === "true" ? "archived" : "active");

  const notes = await NoteService.listNotes(getUserId(req), {
    view,
    query: asString(req.query.q, "q", { maxLength: 200 }),
    tag: asString(req.query.tag, "tag", { maxLength: 60 })?.toLowerCase(),
  });
  res.status(200).json(notes);
});

export const getIndex = asyncHandler(async (req, res) => {
  res.status(200).json(await NoteService.getIndex(getUserId(req)));
});

export const listTags = asyncHandler(async (req, res) => {
  res.status(200).json(await NoteService.listTags(getUserId(req)));
});

export const getNote = asyncHandler(async (req, res) => {
  const note = await NoteService.getNote(String(req.params.id), getUserId(req));
  res.status(200).json(note);
});

export const createNote = asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const note = await NoteService.createNote(
    {
      ...parseFields(b),
      parentId: parseParentId(b),
      templateId: asString(b.templateId, "templateId", { maxLength: 24 }),
      isTemplate: asBoolean(b.isTemplate, "isTemplate"),
    },
    getUserId(req),
  );
  res.status(201).json(note);
});

export const updateNote = asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const note = await NoteService.updateNote(
    String(req.params.id),
    getUserId(req),
    {
      ...parseFields(b),
      pinned: asBoolean(b.pinned, "pinned"),
      archived: asBoolean(b.archived, "archived"),
      cover: parseCover(b.cover),
      parentId: parseParentId(b),
      isTemplate: asBoolean(b.isTemplate, "isTemplate"),
      isDailyTemplate: asBoolean(b.isDailyTemplate, "isDailyTemplate"),
    },
  );
  res.status(200).json(note);
});

export const reorderNotes = asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(b.ids) || b.ids.length > 500) {
    throw new BadRequestError("ids must be an array of at most 500 ids");
  }
  const ids = b.ids.map((id, index) => asString(id, `ids[${index}]`, { maxLength: 24 }) ?? "");
  await NoteService.reorderNotes(getUserId(req), parseParentId(b) ?? null, ids);
  res.status(200).json({ ok: true });
});

export const duplicateNote = asyncHandler(async (req, res) => {
  const note = await NoteService.duplicateNote(
    String(req.params.id),
    getUserId(req),
  );
  res.status(201).json(note);
});

export const restoreNote = asyncHandler(async (req, res) => {
  const note = await NoteService.restoreNote(
    String(req.params.id),
    getUserId(req),
  );
  res.status(200).json(note);
});

/** Moves to the trash; `?permanent=true` deletes a note already in the trash. */
export const deleteNote = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const userId = getUserId(req);

  if (req.query.permanent === "true") {
    await NoteService.deleteNote(id, userId);
    res.status(200).json({ id, message: "Note deleted" });
    return;
  }

  res.status(200).json(await NoteService.trashNote(id, userId));
});

/** The daily note for `:date`, created on first open. The client names it in its own language. */
export const getDaily = asyncHandler(async (req, res) => {
  const date = String(req.params.date);
  if (!DAILY_DATE_PATTERN.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    throw new BadRequestError("date must be YYYY-MM-DD");
  }
  const b = (req.body ?? {}) as Record<string, unknown>;
  const title = asString(b.title, "title", { maxLength: 300 }) || date;
  res.status(200).json(await NoteService.getOrCreateDaily(getUserId(req), date, title));
});

export const getBacklinks = asyncHandler(async (req, res) => {
  res.status(200).json(await NoteService.getBacklinks(String(req.params.id), getUserId(req)));
});

export const listVersions = asyncHandler(async (req, res) => {
  res.status(200).json(await NoteService.listVersions(String(req.params.id), getUserId(req)));
});

export const getVersion = asyncHandler(async (req, res) => {
  res
    .status(200)
    .json(
      await NoteService.getVersion(
        String(req.params.id),
        String(req.params.versionId),
        getUserId(req),
      ),
    );
});

export const restoreVersion = asyncHandler(async (req, res) => {
  res
    .status(200)
    .json(
      await NoteService.restoreVersion(
        String(req.params.id),
        String(req.params.versionId),
        getUserId(req),
      ),
    );
});
