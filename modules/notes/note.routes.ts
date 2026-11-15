import { Router } from "express";
import {
  listNotes,
  getIndex,
  listTags,
  getNote,
  createNote,
  updateNote,
  reorderNotes,
  duplicateNote,
  restoreNote,
  deleteNote,
  getDaily,
  getBacklinks,
  listVersions,
  getVersion,
  restoreVersion,
} from "./note.controller";
import { requireUser } from "../../core/auth";

const router = Router();

router.use(requireUser);

router.route("/").get(listNotes).post(createNote);
// Fixed paths before /:id so they aren't read as note ids.
router.get("/index", getIndex);
router.get("/tags", listTags);
router.patch("/reorder", reorderNotes);
router.post("/daily/:date", getDaily);
router.get("/:id/backlinks", getBacklinks);
router.get("/:id/versions", listVersions);
router.get("/:id/versions/:versionId", getVersion);
router.post("/:id/versions/:versionId/restore", restoreVersion);
router.post("/:id/duplicate", duplicateNote);
router.patch("/:id/restore", restoreNote);
router.route("/:id").get(getNote).patch(updateNote).delete(deleteNote);

export default router;
