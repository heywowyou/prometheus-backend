"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COVER_SOURCES = exports.MEDIA_LOG_STATUSES = exports.MEDIA_LOG_TYPES = void 0;
const mongoose_1 = require("mongoose");
exports.MEDIA_LOG_TYPES = [
    "movie",
    "tvshow",
    "book",
    "music_album",
    "game",
];
exports.MEDIA_LOG_STATUSES = ["finished", "in_progress"];
exports.COVER_SOURCES = ["upload", "external"];
const MediaLogSchema = new mongoose_1.Schema({
    type: { type: String, required: true, enum: exports.MEDIA_LOG_TYPES },
    title: {
        type: String,
        required: [true, "Title is required"],
        trim: true,
        maxlength: [300, "Title must be at most 300 characters"],
    },
    url: { type: String, trim: true },
    cover: { type: mongoose_1.Schema.Types.Mixed },
    rating: {
        type: Number,
        required: true,
        min: [1, "Rating must be at least 1"],
        max: [10, "Rating must be at most 10"],
    },
    review: { type: String, trim: true, maxlength: 10_000 },
    date: { type: Date, required: true },
    status: { type: String, enum: exports.MEDIA_LOG_STATUSES, default: "finished" },
    director: { type: String, trim: true },
    author: { type: String, trim: true },
    pages: { type: Number, min: 1 },
    artist: { type: String, trim: true },
    favorite: { type: Boolean, default: false },
    userId: { type: String, required: true },
}, { timestamps: true });
// Listing by user, newest consumed first.
MediaLogSchema.index({ userId: 1, date: -1 });
// Listing one panel (movies, books, …) for a user.
MediaLogSchema.index({ userId: 1, type: 1, date: -1 });
const MediaLog = (0, mongoose_1.model)("MediaLog", MediaLogSchema);
exports.default = MediaLog;
//# sourceMappingURL=mediaLog.model.js.map