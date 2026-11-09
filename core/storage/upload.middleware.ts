import multer from "multer";
import { BadRequestError } from "../errors/AppError";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    // An AppError so the error middleware answers 400 rather than 500.
    cb(new BadRequestError("Only JPEG, PNG, and WebP images are allowed"));
  },
});

export const uploadSingle = upload.single("file");
