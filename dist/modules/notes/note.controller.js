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
exports.deleteNote = exports.updateNote = exports.createNote = exports.getNote = exports.listNotes = void 0;
const auth_1 = require("../../core/auth");
const http_1 = require("../../core/http");
const note_model_1 = require("./note.model");
const NoteService = __importStar(require("./note.service"));
exports.listNotes = (0, http_1.asyncHandler)(async (req, res) => {
    const notes = await NoteService.listNotes((0, auth_1.getUserId)(req), {
        archived: req.query.archived === "true",
    });
    res.status(200).json(notes);
});
exports.getNote = (0, http_1.asyncHandler)(async (req, res) => {
    const note = await NoteService.getNote(String(req.params.id), (0, auth_1.getUserId)(req));
    res.status(200).json(note);
});
exports.createNote = (0, http_1.asyncHandler)(async (req, res) => {
    const b = (req.body ?? {});
    const note = await NoteService.createNote({
        title: (0, http_1.asString)(b.title, "title", { maxLength: 300 }),
        // Note bodies keep their leading whitespace.
        content: (0, http_1.asString)(b.content, "content", { trim: false }),
    }, (0, auth_1.getUserId)(req));
    res.status(201).json(note);
});
exports.updateNote = (0, http_1.asyncHandler)(async (req, res) => {
    const b = (req.body ?? {});
    const note = await NoteService.updateNote(String(req.params.id), (0, auth_1.getUserId)(req), {
        title: (0, http_1.asString)(b.title, "title", { maxLength: 300 }),
        content: (0, http_1.asString)(b.content, "content", { trim: false }),
        pinned: (0, http_1.asBoolean)(b.pinned, "pinned"),
        archived: (0, http_1.asBoolean)(b.archived, "archived"),
        fontFamily: (0, http_1.asEnum)(b.fontFamily, "fontFamily", note_model_1.NOTE_FONT_FAMILIES),
    });
    res.status(200).json(note);
});
exports.deleteNote = (0, http_1.asyncHandler)(async (req, res) => {
    const id = String(req.params.id);
    await NoteService.deleteNote(id, (0, auth_1.getUserId)(req));
    res.status(200).json({ id, message: "Note deleted" });
});
//# sourceMappingURL=note.controller.js.map