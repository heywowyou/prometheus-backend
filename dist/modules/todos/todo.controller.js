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
exports.deleteTodo = exports.resumeTodo = exports.pauseTodo = exports.toggleTodo = exports.updateTodo = exports.createTodo = exports.listTodos = void 0;
const auth_1 = require("../../core/auth");
const http_1 = require("../../core/http");
const domain_1 = require("../../core/domain");
const todo_model_1 = require("./todo.model");
const TodoService = __importStar(require("./todo.service"));
const parseTodoFields = (body) => {
    const b = (body ?? {});
    return {
        recurrenceType: (0, http_1.asEnum)(b.recurrenceType, "recurrenceType", domain_1.RECURRENCE_TYPES),
        interactionType: (0, http_1.asEnum)(b.interactionType, "interactionType", todo_model_1.INTERACTION_TYPES),
        durationGoal: (0, http_1.asNumber)(b.durationGoal, "durationGoal", { min: 0, integer: true }),
    };
};
exports.listTodos = (0, http_1.asyncHandler)(async (req, res) => {
    const todos = await TodoService.listTodos((0, auth_1.getUserId)(req), {
        paused: req.query.paused === "true",
    });
    res.status(200).json(todos);
});
exports.createTodo = (0, http_1.asyncHandler)(async (req, res) => {
    const b = (req.body ?? {});
    const todo = await TodoService.createTodo({
        text: (0, http_1.asRequiredString)(b.text, "text", { maxLength: 500 }),
        ...parseTodoFields(b),
    }, (0, auth_1.getUserId)(req));
    res.status(201).json(todo);
});
exports.updateTodo = (0, http_1.asyncHandler)(async (req, res) => {
    const b = (req.body ?? {});
    const todo = await TodoService.updateTodo(String(req.params.id), (0, auth_1.getUserId)(req), {
        text: (0, http_1.asString)(b.text, "text", { maxLength: 500 }) || undefined,
        ...parseTodoFields(b),
    });
    res.status(200).json(todo);
});
exports.toggleTodo = (0, http_1.asyncHandler)(async (req, res) => {
    const todo = await TodoService.toggleTodo(String(req.params.id), (0, auth_1.getUserId)(req));
    res.status(200).json(todo);
});
exports.pauseTodo = (0, http_1.asyncHandler)(async (req, res) => {
    const todo = await TodoService.pauseTodo(String(req.params.id), (0, auth_1.getUserId)(req));
    res.status(200).json(todo);
});
exports.resumeTodo = (0, http_1.asyncHandler)(async (req, res) => {
    const todo = await TodoService.resumeTodo(String(req.params.id), (0, auth_1.getUserId)(req));
    res.status(200).json(todo);
});
exports.deleteTodo = (0, http_1.asyncHandler)(async (req, res) => {
    const id = String(req.params.id);
    await TodoService.deleteTodo(id, (0, auth_1.getUserId)(req));
    res.status(200).json({ id, message: "Todo successfully deleted" });
});
//# sourceMappingURL=todo.controller.js.map