import { Router } from "express";
import {
  listMediaLogs,
  createMediaLog,
  updateMediaLog,
  deleteMediaLog,
  toggleFavorite,
} from "./mediaLog.controller";
import { requireUser } from "../../core/auth";

const router = Router();

router.use(requireUser);

router.route("/").get(listMediaLogs).post(createMediaLog);
router.patch("/:id/favorite", toggleFavorite);
router.route("/:id").patch(updateMediaLog).delete(deleteMediaLog);

export default router;
