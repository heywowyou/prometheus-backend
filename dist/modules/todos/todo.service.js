"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTodo = exports.resumeTodo = exports.pauseTodo = exports.toggleTodo = exports.updateTodo = exports.createTodo = exports.listTodos = exports.toView = void 0;
const todo_model_1 = __importDefault(require("./todo.model"));
const todo_history_model_1 = __importDefault(require("./todo-history.model"));
const domain_1 = require("../../core/domain");
const AppError_1 = require("../../core/errors/AppError");
/**
 * Whether a recurring todo's stored completion still applies to the current
 * cycle. A daily todo completed yesterday is stored as `completed: true` but is
 * due again today.
 */
const isCurrentlyComplete = (todo, now = new Date()) => {
    if (!todo.completed)
        return false;
    if (todo.recurrenceType === "none")
        return true;
    return now < (0, domain_1.getNextResetTime)(todo.lastCompletedAt, todo.recurrenceType);
};
const toView = (todo, now = new Date()) => {
    const live = isCurrentlyComplete(todo, now);
    const object = todo.toObject({ versionKey: false });
    return {
        ...object,
        _id: String(todo._id),
        completed: live,
        ...(todo.completed && !live
            ? { dueAgainSince: (0, domain_1.getNextResetTime)(todo.lastCompletedAt, todo.recurrenceType) }
            : {}),
    };
};
exports.toView = toView;
/** Loads a todo and asserts the caller owns it. */
const findOwned = async (id, userId) => {
    const todo = await todo_model_1.default.findById(id);
    if (!todo)
        throw new AppError_1.NotFoundError("Todo");
    if (todo.userId !== userId)
        throw new AppError_1.ForbiddenError();
    return todo;
};
const listTodos = async (userId, opts = {}) => {
    const filter = opts.paused
        ? { userId, paused: true }
        : { userId, paused: { $ne: true } };
    const todos = await todo_model_1.default.find(filter).sort({ createdAt: -1 });
    const now = new Date();
    return todos.map((todo) => (0, exports.toView)(todo, now));
};
exports.listTodos = listTodos;
const createTodo = async (input, userId) => {
    const todo = await todo_model_1.default.create({
        text: input.text,
        userId,
        recurrenceType: input.recurrenceType ?? "none",
        interactionType: input.interactionType ?? "checkbox",
        durationGoal: input.durationGoal ?? 0,
    });
    return (0, exports.toView)(todo);
};
exports.createTodo = createTodo;
const updateTodo = async (id, userId, input) => {
    const todo = await findOwned(id, userId);
    if (input.text !== undefined)
        todo.text = input.text;
    if (input.interactionType !== undefined) {
        todo.interactionType = input.interactionType;
    }
    if (input.durationGoal !== undefined)
        todo.durationGoal = input.durationGoal;
    if (input.recurrenceType !== undefined && input.recurrenceType !== todo.recurrenceType) {
        // Dropping recurrence discards the streak, which no longer has a meaning.
        if (input.recurrenceType === "none") {
            await todo_history_model_1.default.deleteMany({ todoId: todo._id });
            todo.completionCount = 0;
        }
        todo.recurrenceType = input.recurrenceType;
    }
    await todo.save();
    return (0, exports.toView)(todo);
};
exports.updateTodo = updateTodo;
/**
 * Flips a todo's completion.
 *
 * A recurring todo whose cycle has already elapsed completes again (starting a
 * new cycle) rather than un-completing, which is what the user means when they
 * tick a daily task that reads as incomplete.
 */
const toggleTodo = async (id, userId) => {
    const todo = await findOwned(id, userId);
    const now = new Date();
    const isRecurring = todo.recurrenceType !== "none";
    if (isCurrentlyComplete(todo, now)) {
        todo.completed = false;
        if (isRecurring) {
            const latest = await todo_history_model_1.default.findOne({
                todoId: todo._id,
                userId,
            }).sort({ completedAt: -1 });
            if (latest) {
                todo.completionCount = Math.max(0, todo.completionCount - 1);
                await todo_history_model_1.default.findByIdAndDelete(latest._id);
            }
        }
        if (!isRecurring || todo.completionCount === 0) {
            todo.lastCompletedAt = undefined;
        }
    }
    else {
        todo.completed = true;
        todo.lastCompletedAt = now;
        if (isRecurring) {
            todo.completionCount += 1;
            await todo_history_model_1.default.create({
                todoId: todo._id,
                userId,
                completedAt: now,
                tallySnapshot: todo.completionCount,
            });
        }
    }
    await todo.save();
    return (0, exports.toView)(todo, now);
};
exports.toggleTodo = toggleTodo;
const pauseTodo = async (id, userId) => {
    const todo = await findOwned(id, userId);
    if (todo.recurrenceType === "none") {
        throw new AppError_1.BadRequestError("Only recurring todos can be paused");
    }
    todo.paused = true;
    todo.pausedAt = new Date();
    await todo.save();
    return (0, exports.toView)(todo);
};
exports.pauseTodo = pauseTodo;
const resumeTodo = async (id, userId) => {
    const todo = await findOwned(id, userId);
    // Start a fresh cycle from now so a long pause doesn't leave the todo
    // immediately overdue.
    todo.paused = false;
    todo.pausedAt = undefined;
    todo.completed = false;
    todo.lastCompletedAt = new Date();
    await todo.save();
    return (0, exports.toView)(todo);
};
exports.resumeTodo = resumeTodo;
const deleteTodo = async (id, userId) => {
    const todo = await findOwned(id, userId);
    await todo_history_model_1.default.deleteMany({ todoId: todo._id });
    await todo.deleteOne();
};
exports.deleteTodo = deleteTodo;
//# sourceMappingURL=todo.service.js.map