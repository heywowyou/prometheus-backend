import type { Request, Response } from "express";
import MediaLog, { type MediaLogType } from "./mediaLog.model";

interface AuthenticatedRequest extends Request {
  auth?: { userId: string };
}

const getUserId = (req: AuthenticatedRequest): string | null =>
  req.auth?.userId ?? null;

export const getMediaLogs = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const { type } = req.query as { type?: string };

    const query: Record<string, unknown> = { userId };
    if (type && ["movie", "tvshow", "book", "music_album", "game"].includes(type)) {
      query.type = type as MediaLogType;
    }

    const logs = await MediaLog.find(query).sort({ createdAt: -1 });
    return res.status(200).json(logs);
  } catch (error) {
    const err = error as Error;
    return res
      .status(500)
      .json({ message: "Error fetching media logs", error: err.message });
  }
};

export const createMediaLog = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const {
      type,
      title,
      url,
      cover,
      rating,
      review,
      date,
      status,
      director,
      author,
      pages,
      artist,
    } = req.body as {
      type?: MediaLogType;
      title?: string;
      url?: string;
      cover?: string;
      rating?: number;
      review?: string;
      date?: string | Date;
      status?: "finished" | "in_progress";
      director?: string;
      author?: string;
      pages?: number;
      artist?: string;
    };

    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    if (!title || !type) {
      return res
        .status(400)
        .json({ message: "type and title are required" });
    }

    const parsedDate =
      date != null ? new Date(date) : new Date();
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "Invalid date" });
    }

    const numRating =
      typeof rating === "number" ? rating : parseInt(String(rating), 10);
    if (Number.isNaN(numRating) || numRating < 1 || numRating > 10) {
      return res
        .status(400)
        .json({ message: "rating must be a number between 1 and 10" });
    }

    const log = await MediaLog.create({
      type,
      title,
      url: url ?? undefined,
      cover: cover ?? undefined,
      rating: numRating,
      review: review ?? undefined,
      date: parsedDate,
      status: status ?? "finished",
      director: type === "movie" ? director ?? undefined : undefined,
      author: type === "book" ? author ?? undefined : undefined,
      pages: type === "book" ? pages ?? undefined : undefined,
      artist: type === "music_album" ? artist ?? undefined : undefined,
      userId,
    });
    return res.status(201).json(log);
  } catch (error) {
    const err = error as Error;
    return res
      .status(500)
      .json({ message: "Error creating media log", error: err.message });
  }
};

export const updateMediaLog = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const log = await MediaLog.findById(req.params.id);
    if (!log) {
      return res.status(404).json({ message: "Media log not found" });
    }

    const userId = getUserId(req);
    if (!userId || log.userId !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const {
      type,
      title,
      url,
      cover,
      rating,
      review,
      date,
      status,
      director,
      author,
      pages,
      artist,
    } = req.body as {
      type?: MediaLogType;
      title?: string;
      url?: string;
      cover?: string;
      rating?: number;
      review?: string;
      date?: string | Date;
      status?: "finished" | "in_progress";
      director?: string;
      author?: string;
      pages?: number;
      artist?: string;
    };

    if (type != null) log.type = type;
    if (title != null) log.title = title;
    if (url !== undefined) log.url = url || undefined;
    if (cover !== undefined) log.cover = cover || undefined;
    if (rating !== undefined) {
      const numRating =
        typeof rating === "number" ? rating : parseInt(String(rating), 10);
      if (Number.isNaN(numRating) || numRating < 1 || numRating > 10) {
        return res
          .status(400)
          .json({ message: "rating must be a number between 1 and 10" });
      }
      log.rating = numRating;
    }

    if (review !== undefined) {
      log.review = review || undefined;
    }

    if (date !== undefined) {
      const parsedDate = new Date(date);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ message: "Invalid date" });
      }
      log.date = parsedDate;
    }

    if (status !== undefined) {
      if (status !== "finished" && status !== "in_progress") {
        return res
          .status(400)
          .json({ message: "status must be finished or in_progress" });
      }
      log.status = status;
    }

    if (director !== undefined) {
      log.director = director || undefined;
    }
    if (author !== undefined) {
      log.author = author || undefined;
    }
    if (pages !== undefined) {
      log.pages = pages;
    }
    if (artist !== undefined) {
      log.artist = artist || undefined;
    }

    await log.save();
    return res.status(200).json(log);
  } catch (error) {
    const err = error as Error;
    return res
      .status(500)
      .json({ message: "Error updating media log", error: err.message });
  }
};

export const deleteMediaLog = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const log = await MediaLog.findById(req.params.id);
    if (!log) {
      return res.status(404).json({ message: "Media log not found" });
    }

    const userId = getUserId(req);
    if (!userId || log.userId !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await log.deleteOne();
    return res
      .status(200)
      .json({ id: req.params.id, message: "Media log deleted" });
  } catch (error) {
    const err = error as Error;
    return res
      .status(500)
      .json({ message: "Error deleting media log", error: err.message });
  }
};
