import { Router } from "express";
import requireUser from "../../core/auth/requireUser";
import { uploadSingle } from "../../core/storage/upload.middleware";
import {
  uploadImageHandler,
  uploadFromUrlHandler,
  deleteImageHandler,
} from "./images.controller";

const router = Router();

router.use(requireUser);

router.post("/upload", uploadSingle, uploadImageHandler);
router.post("/upload-from-url", uploadFromUrlHandler);
router.delete("/", deleteImageHandler);

export default router;
