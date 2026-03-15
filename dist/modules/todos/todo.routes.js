"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const todo_controller_1 = require("./todo.controller");
const requireUser_1 = __importDefault(require("../../core/auth/requireUser"));
const router = (0, express_1.Router)();
router.use(requireUser_1.default);
router.route("/").get(todo_controller_1.getTodos).post(todo_controller_1.createTodo);
router.route("/:id").put(todo_controller_1.updateTodo).delete(todo_controller_1.deleteTodo);
exports.default = router;
