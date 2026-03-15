"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const MediaLogSchema = new mongoose_1.Schema({
    type: {
        type: String,
        required: true,
        enum: ["movie", "tvshow", "book", "music_album", "game"],
    },
    title: {
        type: String,
        required: [true, "Title is required"],
        trim: true,
    },
    url: { type: String, trim: true },
    cover: { type: String, trim: true },
    rating: {
        type: Number,
        required: true,
        min: [1, "Rating must be at least 1"],
        max: [10, "Rating must be at most 10"],
    },
    review: {
        type: String,
        trim: true,
    },
    date: {
        type: Date,
        required: true,
    },
    status: {
        type: String,
        enum: ["finished", "in_progress"],
        default: "finished",
    },
    director: {
        type: String,
        trim: true,
    },
    author: {
        type: String,
        trim: true,
    },
    pages: {
        type: Number,
        min: 1,
    },
    artist: {
        type: String,
        trim: true,
    },
    userId: {
        type: String,
        required: true,
    },
}, { timestamps: true });
// Index for listing by user, newest first
MediaLogSchema.index({ userId: 1, createdAt: -1 });
const MediaLog = (0, mongoose_1.model)("MediaLog", MediaLogSchema);
exports.default = MediaLog;
