import { getUserId } from "../../core/auth";
import {
  asString,
  asBoolean,
  asEnum,
  asyncHandler,
} from "../../core/http";
import { BadRequestError } from "../../core/errors/AppError";
import { NOTE_FONT_FAMILIES, NOTE_VIEWS } from "./note.model";
import * as NoteService from "./note.service";

const parseTags = (value: unknown): string[] | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new BadRequestError("tags must be an array");
  return value.map((tag, index) => asString(tag, `tags[${index}]`, { maxLength: 60 }) ?? "");
};

const parseFields = (b: Record<string, unknown>) => ({
  title: asString(b.title, "title", { maxLength: 300 }),
  // Note bodies keep their leading whitespace.
  content: asString(b.content, "content", { trim: false }),
  tags: parseTags(b.tags),
  fontFamily: asEnum(b.fontFamily, "fontFamily", NOTE_FONT_FAMILIES),
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

export const listTags = asyncHandler(async (req, res) => {
  res.status(200).json(await NoteService.listTags(getUserId(req)));
});

export const getNote = asyncHandler(async (req, res) => {
  const note = await NoteService.getNote(String(req.params.id), getUserId(req));
  res.status(200).json(note);
});

export const createNote = asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const note = await NoteService.createNote(parseFields(b), getUserId(req));
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
    },
  );
  res.status(200).json(note);
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
