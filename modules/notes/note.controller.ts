import { getUserId } from "../../core/auth";
import {
  asString,
  asBoolean,
  asEnum,
  asyncHandler,
} from "../../core/http";
import { NOTE_FONT_FAMILIES } from "./note.model";
import * as NoteService from "./note.service";

export const listNotes = asyncHandler(async (req, res) => {
  const notes = await NoteService.listNotes(getUserId(req), {
    archived: req.query.archived === "true",
  });
  res.status(200).json(notes);
});

export const getNote = asyncHandler(async (req, res) => {
  const note = await NoteService.getNote(String(req.params.id), getUserId(req));
  res.status(200).json(note);
});

export const createNote = asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const note = await NoteService.createNote(
    {
      title: asString(b.title, "title", { maxLength: 300 }),
      // Note bodies keep their leading whitespace.
      content: asString(b.content, "content", { trim: false }),
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
      title: asString(b.title, "title", { maxLength: 300 }),
      content: asString(b.content, "content", { trim: false }),
      pinned: asBoolean(b.pinned, "pinned"),
      archived: asBoolean(b.archived, "archived"),
      fontFamily: asEnum(b.fontFamily, "fontFamily", NOTE_FONT_FAMILIES),
    },
  );
  res.status(200).json(note);
});

export const deleteNote = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  await NoteService.deleteNote(id, getUserId(req));
  res.status(200).json({ id, message: "Note deleted" });
});
