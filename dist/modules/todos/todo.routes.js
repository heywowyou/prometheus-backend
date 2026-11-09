"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const todo_controller_1 = require("./todo.controller");
const auth_1 = require("../../core/auth");
const router = (0, express_1.Router)();
router.use(auth_1.requireUser);
router.route("/").get(todo_controller_1.listTodos).post(todo_controller_1.createTodo);
// Completion is its own endpoint: toggling and editing fields were previously
// inferred from the request body shape, which made both paths easy to break.
router.patch("/:id/toggle", todo_controller_1.toggleTodo);
router.patch("/:id/pause", todo_controller_1.pauseTodo);
router.patch("/:id/resume", todo_controller_1.resumeTodo);
router.route("/:id").patch(todo_controller_1.updateTodo).delete(todo_controller_1.deleteTodo);
exports.default = router;
//# sourceMappingURL=todo.routes.js.map