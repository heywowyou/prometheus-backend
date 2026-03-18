import { v2 as cloudinary } from "cloudinary";

export async function uploadImage(
  buffer: Buffer,
  options: { folder?: string } = {},
): Promise<{ url: string; publicId: string }> {
  // Configure lazily so dotenv has already run by the time this is called.
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

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
