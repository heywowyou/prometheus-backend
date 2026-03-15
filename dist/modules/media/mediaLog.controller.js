"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMediaLog = exports.updateMediaLog = exports.createMediaLog = exports.getMediaLogs = void 0;
const mediaLog_model_1 = __importDefault(require("./mediaLog.model"));
const getUserId = (req) => req.auth?.userId ?? null;
const getMediaLogs = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "User not authenticated" });
        }
        const { type } = req.query;
        const query = { userId };
        if (type && ["movie", "tvshow", "book", "music_album", "game"].includes(type)) {
            query.type = type;
        }
        const logs = await mediaLog_model_1.default.find(query).sort({ createdAt: -1 });
        return res.status(200).json(logs);
    }
    catch (error) {
        const err = error;
        return res
            .status(500)
            .json({ message: "Error fetching media logs", error: err.message });
    }
};
exports.getMediaLogs = getMediaLogs;
const createMediaLog = async (req, res) => {
    try {
        const { type, title, url, cover, rating, review, date, status, director, author, pages, artist, } = req.body;
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "User not authenticated" });
        }
        if (!title || !type) {
            return res
                .status(400)
                .json({ message: "type and title are required" });
        }
        const parsedDate = date != null ? new Date(date) : new Date();
        if (Number.isNaN(parsedDate.getTime())) {
            return res.status(400).json({ message: "Invalid date" });
        }
        const numRating = typeof rating === "number" ? rating : parseInt(String(rating), 10);
        if (Number.isNaN(numRating) || numRating < 1 || numRating > 10) {
            return res
                .status(400)
                .json({ message: "rating must be a number between 1 and 10" });
        }
        const log = await mediaLog_model_1.default.create({
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
    }
    catch (error) {
        const err = error;
        return res
            .status(500)
            .json({ message: "Error creating media log", error: err.message });
    }
};
exports.createMediaLog = createMediaLog;
const updateMediaLog = async (req, res) => {
    try {
        const log = await mediaLog_model_1.default.findById(req.params.id);
        if (!log) {
            return res.status(404).json({ message: "Media log not found" });
        }
        const userId = getUserId(req);
        if (!userId || log.userId !== userId) {
            return res.status(403).json({ message: "Not authorized" });
        }
        const { type, title, url, cover, rating, review, date, status, director, author, pages, artist, } = req.body;
        if (type != null)
            log.type = type;
        if (title != null)
            log.title = title;
        if (url !== undefined)
            log.url = url || undefined;
        if (cover !== undefined)
            log.cover = cover || undefined;
        if (rating !== undefined) {
            const numRating = typeof rating === "number" ? rating : parseInt(String(rating), 10);
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
    }
    catch (error) {
        const err = error;
        return res
            .status(500)
            .json({ message: "Error updating media log", error: err.message });
    }
};
exports.updateMediaLog = updateMediaLog;
const deleteMediaLog = async (req, res) => {
    try {
        const log = await mediaLog_model_1.default.findById(req.params.id);
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
    }
    catch (error) {
        const err = error;
        return res
            .status(500)
            .json({ message: "Error deleting media log", error: err.message });
    }
};
exports.deleteMediaLog = deleteMediaLog;
