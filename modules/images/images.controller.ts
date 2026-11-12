import { asRequiredString, asyncHandler } from "../../core/http";
import { BadRequestError } from "../../core/errors/AppError";
import {
  uploadImage,
  importRemoteImage,
  MEDIA_IMAGE_FOLDER,
} from "../../core/storage";

export const uploadImageHandler = asyncHandler(async (req, res) => {
  if (!req.file) throw new BadRequestError("No file provided");

  const result = await uploadImage(req.file.buffer, {
    folder: MEDIA_IMAGE_FOLDER,
  });
  res.status(201).json(result);
});

export const uploadFromUrlHandler = asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const url = asRequiredString(b.url, "url", { maxLength: 2000 });

  // `importRemoteImage` validates the URL, blocks non-public addresses, and
  // caps the download size before anything reaches Cloudinary.
  const result = await importRemoteImage(url);
  res.status(201).json(result);
});
