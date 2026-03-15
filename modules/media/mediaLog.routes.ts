import { Router } from "express";
import {
  getMediaLogs,
  createMediaLog,
  updateMediaLog,
  deleteMediaLog,
} from "./mediaLog.controller";
import requireUser from "../../core/auth/requireUser";

const router = Router();

router.use(requireUser);

router.route("/").get(getMediaLogs).post(createMediaLog);
router.route("/:id").put(updateMediaLog).delete(deleteMediaLog);

export default router;
