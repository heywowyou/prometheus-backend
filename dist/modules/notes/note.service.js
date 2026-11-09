"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteNote = exports.updateNote = exports.createNote = exports.getNote = exports.listNotes = void 0;
const note_model_1 = __importDefault(require("./note.model"));
const AppError_1 = require("../../core/errors/AppError");
const findOwned = async (id, userId) => {
    const note = await note_model_1.default.findById(id);
    if (!note)
        throw new AppError_1.NotFoundError("Note");
    if (note.userId !== userId)
        throw new AppError_1.ForbiddenError();
    return note;
};
const listNotes = async (userId, opts = {}) => note_model_1.default.find({ userId, archived: opts.archived ?? false }).sort({
    pinned: -1,
    updatedAt: -1,
});
exports.listNotes = listNotes;
const getNote = async (id, userId) => findOwned(id, userId);
exports.getNote = getNote;
const createNote = async (input, userId) => note_model_1.default.create({
    title: input.title ?? "",
    content: input.content ?? "",
    userId,
});
exports.createNote = createNote;
const updateNote = async (id, userId, input) => {
    const note = await findOwned(id, userId);
    if (input.title !== undefined)
        note.title = input.title;
    if (input.content !== undefined)
        note.content = input.content;
    if (input.pinned !== undefined)
        note.pinned = input.pinned;
    if (input.archived !== undefined)
        note.archived = input.archived;
    if (input.fontFamily !== undefined)
        note.fontFamily = input.fontFamily;
    await note.save();
    return note;
};
exports.updateNote = updateNote;
const deleteNote = async (id, userId) => {
    const note = await findOwned(id, userId);
    await note.deleteOne();
};
exports.deleteNote = deleteNote;
//# sourceMappingURL=note.service.js.map