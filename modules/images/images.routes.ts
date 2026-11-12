import { Router } from "express";
import { requireUser } from "../../core/auth";
import { uploadSingle } from "../../core/storage";
import {
  uploadImageHandler,
  uploadFromUrlHandler,
} from "./images.controller";

const router = Router();

router.use(requireUser);

// There is deliberately no DELETE route: an asset id carries no owner, so a
// client-driven delete could remove anyone's image. Services that own a cover
// (e.g. media logs) delete it server-side when it is replaced or removed.
router.post("/upload", uploadSingle, uploadImageHandler);
router.post("/upload-from-url", uploadFromUrlHandler);

export default router;
