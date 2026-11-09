"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const note_controller_1 = require("./note.controller");
const auth_1 = require("../../core/auth");
const router = (0, express_1.Router)();
router.use(auth_1.requireUser);
router.route("/").get(note_controller_1.listNotes).post(note_controller_1.createNote);
router.route("/:id").get(note_controller_1.getNote).patch(note_controller_1.updateNote).delete(note_controller_1.deleteNote);
exports.default = router;
//# sourceMappingURL=note.routes.js.map