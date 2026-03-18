import type { Request, Response } from "express";
import { uploadImage, deleteImage } from "../../core/storage/cloudinary";

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
