import type { Request, Response } from "express";
import { uploadImage, deleteImage } from "../../core/storage/cloudinary";

export const uploadFromUrlHandler = async (req: Request, res: Response) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url || typeof url !== "string") {
      return res.status(400).json({ message: "url field is required" });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ message: "Invalid URL" });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return res.status(400).json({ message: "URL must use http or https" });
    }

    const response = await fetch(url);
    if (!response.ok) {
      return res
        .status(422)
        .json({ message: `Failed to fetch image: HTTP ${response.status}` });
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return res
        .status(422)
        .json({ message: "URL does not point to an image" });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await uploadImage(buffer, { folder: "prometheus/media" });
    return res.status(200).json(result);
  } catch (error) {
    const err = error as Error;
    return res
      .status(500)
      .json({ message: "Upload failed", error: err.message });
  }
};

export const uploadImageHandler = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file provided" });
    }

    const result = await uploadImage(req.file.buffer, {
      folder: "prometheus/media",
    });

    return res.status(200).json(result);
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({ message: "Upload failed", error: err.message });
  }
};

export const deleteImageHandler = async (req: Request, res: Response) => {
  try {
    const publicId = req.query.publicId as string | undefined;
    if (!publicId) {
      return res.status(400).json({ message: "publicId query parameter is required" });
    }
    await deleteImage(publicId);
    return res.status(204).send();
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({ message: "Delete failed", error: err.message });
  }
};
