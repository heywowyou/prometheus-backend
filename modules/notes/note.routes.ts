import { Router } from "express";
import { listNotes, getNote, createNote, updateNote, deleteNote } from "./note.controller";
import requireUser from "../../core/auth/requireUser";

const router = Router();

router.use(requireUser);

router.route("/").get(listNotes).post(createNote);
router.route("/:id").get(getNote).patch(updateNote).delete(deleteNote);

export default router;
