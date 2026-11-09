import { asRequiredString, asyncHandler } from "../../core/http";
import { BadRequestError } from "../../core/errors/AppError";
import {
  uploadImage,
  deleteImage,
  fetchRemoteImage,
} from "../../core/storage";

const MEDIA_FOLDER = "prometheus/media";

export const uploadImageHandler = asyncHandler(async (req, res) => {
  if (!req.file) throw new BadRequestError("No file provided");

  const result = await uploadImage(req.file.buffer, { folder: MEDIA_FOLDER });
  res.status(201).json(result);
});

export const uploadFromUrlHandler = asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const url = asRequiredString(b.url, "url", { maxLength: 2000 });

  // `fetchRemoteImage` validates the URL, blocks non-public addresses, and
  // caps the download size before anything reaches Cloudinary.
  const buffer = await fetchRemoteImage(url);
  const result = await uploadImage(buffer, { folder: MEDIA_FOLDER });
  res.status(201).json(result);
});

export const deleteImageHandler = asyncHandler(async (req, res) => {
  const publicId = asRequiredString(req.query.publicId, "publicId");

  // Scoped to the app's own folder so a crafted id can't reach another
  // project's assets in the same Cloudinary account.
  if (!publicId.startsWith(`${MEDIA_FOLDER}/`)) {
    throw new BadRequestError("publicId is outside the media folder");
  }

  await deleteImage(publicId);
  res.status(204).send();
});
