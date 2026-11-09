"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMediaLog = exports.toggleFavorite = exports.updateMediaLog = exports.createMediaLog = exports.listMediaLogs = void 0;
const auth_1 = require("../../core/auth");
const http_1 = require("../../core/http");
const AppError_1 = require("../../core/errors/AppError");
const mediaLog_model_1 = require("./mediaLog.model");
const MediaService = __importStar(require("./media.service"));
/** Accepts either the structured cover or a bare URL string from older clients. */
const parseCover = (value) => {
    if (value === null || value === "")
        return null;
    if (typeof value === "string")
        return { url: value, source: "external" };
    if (typeof value !== "object") {
        throw new AppError_1.BadRequestError("cover must be an object, a URL string, or null");
    }
    const c = value;
    const url = (0, http_1.asString)(c.url, "cover.url");
    if (!url)
        return null;
    const source = (0, http_1.asEnum)(c.source, "cover.source", mediaLog_model_1.COVER_SOURCES) ?? "external";
    const publicId = (0, http_1.asString)(c.publicId, "cover.publicId");
    return { url, source, ...(publicId ? { publicId } : {}) };
};
const parseCredits = (b) => ({
    director: (0, http_1.asString)(b.director, "director", { maxLength: 200 }),
    author: (0, http_1.asString)(b.author, "author", { maxLength: 200 }),
    pages: (0, http_1.asNumber)(b.pages, "pages", { min: 1, integer: true }),
    artist: (0, http_1.asString)(b.artist, "artist", { maxLength: 200 }),
});
exports.listMediaLogs = (0, http_1.asyncHandler)(async (req, res) => {
    const logs = await MediaService.listLogs((0, auth_1.getUserId)(req), {
        type: (0, http_1.asEnum)(req.query.type, "type", mediaLog_model_1.MEDIA_LOG_TYPES),
    });
    res.status(200).json(logs);
});
exports.createMediaLog = (0, http_1.asyncHandler)(async (req, res) => {
    const b = (req.body ?? {});
    const type = (0, http_1.asEnum)(b.type, "type", mediaLog_model_1.MEDIA_LOG_TYPES);
    if (!type)
        throw new AppError_1.BadRequestError("type is required");
    const rating = (0, http_1.asNumber)(b.rating, "rating", { min: 1, max: 10 });
    if (rating === undefined)
        throw new AppError_1.BadRequestError("rating is required");
    const log = await MediaService.createLog({
        type,
        title: (0, http_1.asRequiredString)(b.title, "title", { maxLength: 300 }),
        rating,
        date: (0, http_1.asDate)(b.date, "date") ?? new Date(),
        url: (0, http_1.asString)(b.url, "url", { maxLength: 2000 }),
        cover: parseCover(b.cover) ?? undefined,
        review: (0, http_1.asString)(b.review, "review", { maxLength: 10_000 }),
        status: (0, http_1.asEnum)(b.status, "status", mediaLog_model_1.MEDIA_LOG_STATUSES),
        ...parseCredits(b),
    }, (0, auth_1.getUserId)(req));
    res.status(201).json(log);
});
exports.updateMediaLog = (0, http_1.asyncHandler)(async (req, res) => {
    const b = (req.body ?? {});
    const log = await MediaService.updateLog(String(req.params.id), (0, auth_1.getUserId)(req), {
        type: (0, http_1.asEnum)(b.type, "type", mediaLog_model_1.MEDIA_LOG_TYPES),
        title: (0, http_1.asString)(b.title, "title", { maxLength: 300 }) || undefined,
        rating: (0, http_1.asNumber)(b.rating, "rating", { min: 1, max: 10 }),
        date: (0, http_1.asDate)(b.date, "date"),
        url: (0, http_1.asString)(b.url, "url", { maxLength: 2000 }),
        // Only touch the cover when the client actually sent the key, so a
        // partial update can't silently delete an existing image.
        ...((0, http_1.supplied)(b, "cover") ? { cover: parseCover(b.cover) } : {}),
        review: (0, http_1.asString)(b.review, "review", { maxLength: 10_000 }),
        status: (0, http_1.asEnum)(b.status, "status", mediaLog_model_1.MEDIA_LOG_STATUSES),
        ...parseCredits(b),
    });
    res.status(200).json(log);
});
exports.toggleFavorite = (0, http_1.asyncHandler)(async (req, res) => {
    const log = await MediaService.toggleFavorite(String(req.params.id), (0, auth_1.getUserId)(req));
    res.status(200).json(log);
});
exports.deleteMediaLog = (0, http_1.asyncHandler)(async (req, res) => {
    const id = String(req.params.id);
    await MediaService.deleteLog(id, (0, auth_1.getUserId)(req));
    res.status(200).json({ id, message: "Media log deleted" });
});
//# sourceMappingURL=mediaLog.controller.js.map