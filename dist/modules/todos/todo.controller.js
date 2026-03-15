"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTodo = exports.updateTodo = exports.createTodo = exports.getTodos = void 0;
const todo_model_1 = __importDefault(require("./todo.model"));
const todo_history_model_1 = __importDefault(require("./todo-history.model"));
const recurrence_1 = require("../../core/domain/recurrence");
const getUserId = (req) => req.auth?.userId ?? null;
const getTodos = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "User not authenticated" });
        }
        const todos = await todo_model_1.default.find({ userId });
        return res.status(200).json(todos);
    }
    catch (error) {
        const err = error;
        return res
            .status(500)
            .json({ message: "Error fetching todos", error: err.message });
    }
};
exports.getTodos = getTodos;
const createTodo = async (req, res) => {
    try {
        const { text, recurrenceType, interactionType, durationGoal } = req.body;
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "User not authenticated" });
        }
        if (!text) {
            return res.status(400).json({ message: "Please add a text field" });
        }
        const todo = await todo_model_1.default.create({
            text,
            userId,
            recurrenceType: recurrenceType ?? "none",
            interactionType: interactionType ?? "checkbox",
            durationGoal: durationGoal ?? 0,
        });
        return res.status(201).json(todo);
    }
    catch (error) {
        const err = error;
        return res
            .status(500)
            .json({ message: "Error creating todo", error: err.message });
    }
};
exports.createTodo = createTodo;
const updateTodo = async (req, res) => {
    try {
        const todo = await todo_model_1.default.findById(req.params.id);
        if (!todo) {
            return res.status(404).json({ message: "Todo not found" });
        }
        const userId = getUserId(req);
        if (!userId || todo.userId !== userId) {
            return res.status(403).json({ message: "Not authorized" });
        }
        const { text, recurrenceType, interactionType, durationGoal } = req.body;
        if (text)
            todo.text = text;
        if (recurrenceType)
            todo.recurrenceType = recurrenceType;
        if (interactionType)
            todo.interactionType = interactionType;
        if (durationGoal !== undefined)
            todo.durationGoal = durationGoal;
        let shouldUpdateStatus = false;
        let targetStatus = null;
        if (Object.keys(req.body).length === 0) {
            shouldUpdateStatus = true;
            targetStatus = !todo.completed;
        }
        else if (Object.prototype.hasOwnProperty.call(req.body, "completed")) {
            shouldUpdateStatus = true;
            targetStatus = req.body.completed;
        }
        if (shouldUpdateStatus && targetStatus !== null) {
            let isCompleting = targetStatus;
            const now = new Date();
            if (todo.completed && todo.recurrenceType !== "none") {
                const resetTime = (0, recurrence_1.getNextResetTime)(todo.lastCompletedAt ?? undefined, todo.recurrenceType);
                if (now >= resetTime) {
                    isCompleting = true;
                }
            }
            if (isCompleting) {
                todo.completed = true;
                if (todo.recurrenceType !== "none") {
                    todo.completionCount += 1;
                    await todo_history_model_1.default.create({
                        todoId: todo._id,
                        userId,
                        completedAt: now,
                        tallySnapshot: todo.completionCount,
                    });
                }
                todo.lastCompletedAt = now;
            }
            else {
                todo.completed = false;
                if (todo.recurrenceType !== "none") {
                    const latestHistory = await todo_history_model_1.default.findOne({
                        todoId: todo._id,
                    }).sort({ completedAt: -1 });
                    if (latestHistory) {
                        todo.completionCount -= 1;
                        await todo_history_model_1.default.findByIdAndDelete(latestHistory._id);
                    }
                }
                if (todo.completionCount === 0 || todo.recurrenceType === "none") {
                    todo.lastCompletedAt = undefined;
                }
            }
        }
        await todo.save();
        return res.status(200).json(todo);
    }
    catch (error) {
        const err = error;
        // eslint-disable-next-line no-console
        console.error(err);
        return res
            .status(500)
            .json({ message: "Error updating todo", error: err.message });
    }
};
exports.updateTodo = updateTodo;
const deleteTodo = async (req, res) => {
    try {
        const todo = await todo_model_1.default.findById(req.params.id);
        if (!todo) {
            return res.status(404).json({ message: "Todo not found" });
        }
        const userId = getUserId(req);
        if (!userId || todo.userId !== userId) {
            return res
                .status(403)
                .json({ message: "Not authorized to delete this task" });
        }
        if (todo.recurrenceType !== "none") {
            await todo_history_model_1.default.deleteMany({ todoId: todo._id });
        }
        await todo.deleteOne();
        return res
            .status(200)
            .json({ id: req.params.id, message: "Todo successfully deleted" });
    }
    catch (error) {
        const err = error;
        return res
            .status(500)
            .json({ message: "Error deleting todo", error: err.message });
    }
};
exports.deleteTodo = deleteTodo;
