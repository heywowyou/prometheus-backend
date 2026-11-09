import { v2 as cloudinary } from "cloudinary";
import config from "../config";
import logger from "../logger";

// Configured once at import time; `core/config` has already loaded dotenv.
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

export interface StoredImage {
  url: string;
  publicId: string;
}

export interface UploadOptions {
  folder?: string;
}

export async function uploadImage(
  buffer: Buffer,
  options: UploadOptions = {},
): Promise<StoredImage> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: options.folder,
          resource_type: "image",
          fetch_format: "auto",
          quality: "auto",
          width: 800,
          crop: "limit",
        },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error("Cloudinary upload failed"));
            return;
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      )
      .end(buffer);
  });
}

export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}

/**
 * Best-effort cleanup for images whose owning document is going away.
 *
 * Deliberately swallows failures: an orphaned Cloudinary asset is a smaller
 * problem than a delete request that fails after the document is already gone.
 */
export async function deleteImageQuietly(
  publicId: string | undefined | null,
): Promise<void> {
  if (!publicId) return;
  try {
    await deleteImage(publicId);
  } catch (error) {
    logger.warn(`Failed to delete Cloudinary asset ${publicId}`, error);
  }
}
