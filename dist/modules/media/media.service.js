"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteLog = exports.toggleFavorite = exports.updateLog = exports.createLog = exports.listLogs = exports.resolveCover = void 0;
const mediaLog_model_1 = __importDefault(require("./mediaLog.model"));
const storage_1 = require("../../core/storage");
const AppError_1 = require("../../core/errors/AppError");
/** Reads a stored cover, tolerating documents that predate the structured shape. */
const resolveCover = (cover) => {
    if (!cover)
        return undefined;
    if (typeof cover === "string") {
        return cover ? { url: cover, source: "external" } : undefined;
    }
    if (!cover.url)
        return undefined;
    return {
        url: cover.url,
        source: cover.source === "upload" ? "upload" : "external",
        ...(cover.publicId ? { publicId: cover.publicId } : {}),
    };
};
exports.resolveCover = resolveCover;
/** The Cloudinary id owned by a cover, if the cover is one we uploaded. */
const ownedPublicId = (cover) => {
    const resolved = (0, exports.resolveCover)(cover);
    return resolved?.source === "upload" ? resolved.publicId : undefined;
};
const findOwned = async (id, userId) => {
    const log = await mediaLog_model_1.default.findById(id);
    if (!log)
        throw new AppError_1.NotFoundError("Media log");
    if (log.userId !== userId)
        throw new AppError_1.ForbiddenError();
    return log;
};
const listLogs = async (userId, opts = {}) => {
    const filter = { userId };
    if (opts.type)
        filter.type = opts.type;
    return mediaLog_model_1.default.find(filter).sort({ date: -1 });
};
exports.listLogs = listLogs;
/** Type-specific credits, blanked out for types they don't apply to. */
const creditsFor = (type, input) => ({
    director: type === "movie" ? input.director : undefined,
    author: type === "book" ? input.author : undefined,
    pages: type === "book" ? input.pages : undefined,
    artist: type === "music_album" ? input.artist : undefined,
});
const createLog = async (input, userId) => mediaLog_model_1.default.create({
    type: input.type,
    title: input.title,
    url: input.url,
    cover: (0, exports.resolveCover)(input.cover),
    rating: input.rating,
    review: input.review,
    date: input.date,
    status: input.status ?? "finished",
    ...creditsFor(input.type, input),
    userId,
});
exports.createLog = createLog;
const updateLog = async (id, userId, input) => {
    const log = await findOwned(id, userId);
    if (input.type !== undefined)
        log.type = input.type;
    if (input.title !== undefined)
        log.title = input.title;
    if (input.url !== undefined)
        log.url = input.url || undefined;
    if (input.rating !== undefined)
        log.rating = input.rating;
    if (input.review !== undefined)
        log.review = input.review || undefined;
    if (input.date !== undefined)
        log.date = input.date;
    if (input.status !== undefined)
        log.status = input.status;
    if (input.cover !== undefined) {
        // Replacing or clearing an uploaded cover orphans its Cloudinary asset, so
        // clean it up here rather than trusting each client to do it.
        const previousId = ownedPublicId(log.cover);
        const nextId = ownedPublicId(input.cover);
        if (previousId && previousId !== nextId) {
            await (0, storage_1.deleteImageQuietly)(previousId);
        }
        log.cover = input.cover === null ? undefined : (0, exports.resolveCover)(input.cover);
        log.markModified("cover");
    }
    // Credits follow the (possibly updated) type: fields that don't apply to the
    // current type are cleared, so switching a book to a movie can't leave a
    // stale author behind.
    const credits = creditsFor(log.type, {
        director: input.director ?? log.director,
        author: input.author ?? log.author,
        pages: input.pages ?? log.pages,
        artist: input.artist ?? log.artist,
    });
    log.director = credits.director || undefined;
    log.author = credits.author || undefined;
    log.pages = credits.pages;
    log.artist = credits.artist || undefined;
    await log.save();
    return log;
};
exports.updateLog = updateLog;
const toggleFavorite = async (id, userId) => {
    const log = await findOwned(id, userId);
    log.favorite = !log.favorite;
    await log.save();
    return log;
};
exports.toggleFavorite = toggleFavorite;
const deleteLog = async (id, userId) => {
    const log = await findOwned(id, userId);
    // Delete the document first: a failed Cloudinary call must not block the
    // delete the user asked for, and `deleteImageQuietly` only logs on failure.
    await log.deleteOne();
    await (0, storage_1.deleteImageQuietly)(ownedPublicId(log.cover));
};
exports.deleteLog = deleteLog;
//# sourceMappingURL=media.service.js.map