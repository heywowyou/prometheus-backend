import { Router } from "express";
import {
  listNotes,
  listTags,
  getNote,
  createNote,
  updateNote,
  duplicateNote,
  restoreNote,
  deleteNote,
} from "./note.controller";
import { requireUser } from "../../core/auth";

const router = Router();

router.use(requireUser);

router.route("/").get(listNotes).post(createNote);
// Before /:id so "tags" isn't read as a note id.
router.get("/tags", listTags);
router.post("/:id/duplicate", duplicateNote);
router.patch("/:id/restore", restoreNote);
router.route("/:id").get(getNote).patch(updateNote).delete(deleteNote);

export default router;
