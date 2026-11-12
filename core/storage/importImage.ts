import { uploadImage, type StoredImage } from "./cloudinary";
import { fetchRemoteImage } from "./remoteImage";

/** Cloudinary folder for every image the app stores (covers, note images). */
export const MEDIA_IMAGE_FOLDER = "prometheus/media";

/**
 * Copies a remote image into Cloudinary through the SSRF-guarded fetcher, so a
 * stored cover can't break when the source site reorganises.
 */
export const importRemoteImage = async (
  url: string,
  folder: string = MEDIA_IMAGE_FOLDER,
): Promise<StoredImage> => uploadImage(await fetchRemoteImage(url), { folder });
