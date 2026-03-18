import type { Request, Response } from "express";
import { uploadImage } from "../../core/storage/cloudinary";

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
