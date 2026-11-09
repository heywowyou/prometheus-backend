"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOTE_FONT_FAMILIES = void 0;
const mongoose_1 = require("mongoose");
exports.NOTE_FONT_FAMILIES = ["sans", "serif"];
const NoteSchema = new mongoose_1.Schema({
    title: {
        type: String,
        default: "",
        trim: true,
        maxlength: [300, "Title must be at most 300 characters"],
    },
    content: { type: String, default: "" },
    userId: { type: String, required: true },
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    fontFamily: {
        type: String,
        enum: exports.NOTE_FONT_FAMILIES,
        default: "sans",
    },
}, { timestamps: true });
// Serves the dashboard listing: a user's unarchived notes, pinned first.
NoteSchema.index({ userId: 1, archived: 1, pinned: -1, updatedAt: -1 });
const Note = (0, mongoose_1.model)("Note", NoteSchema);
exports.default = Note;
//# sourceMappingURL=note.model.js.map