import type { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import * as NoteService from "./note.service";

export const listNotes = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const notes = await NoteService.getNotes(userId);
    return res.status(200).json(notes);
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({ message: "Error fetching notes", error: err.message });
  }
};

export const getNote = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const note = await NoteService.getNoteById(String(req.params.id), userId);
    if (note === null) return res.status(404).json({ message: "Note not found" });

    return res.status(200).json(note);
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({ message: "Error fetching note", error: err.message });
  }
};

export const createNote = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { title = "", content = "" } = req.body as { title?: string; content?: string };

    const note = await NoteService.createNote({ title, content }, userId);
    return res.status(201).json(note);
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({ message: "Error creating note", error: err.message });
  }
};

export const updateNote = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const result = await NoteService.updateNote(
      String(req.params.id),
      userId,
      req.body as { title?: string; content?: string; pinned?: boolean; archived?: boolean }
    );

    if (result === null) return res.status(404).json({ message: "Note not found" });
    if (result === undefined) return res.status(403).json({ message: "Not authorized" });

    return res.status(200).json(result);
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({ message: "Error updating note", error: err.message });
  }
};

export const deleteNote = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const result = await NoteService.deleteNote(String(req.params.id), userId);

    if (result === null) return res.status(404).json({ message: "Note not found" });
    if (result === undefined) return res.status(403).json({ message: "Not authorized" });

    return res.status(200).json({ id: req.params.id, message: "Note deleted" });
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({ message: "Error deleting note", error: err.message });
  }
};
