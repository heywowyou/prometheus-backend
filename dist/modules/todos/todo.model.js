"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTERACTION_TYPES = void 0;
const mongoose_1 = require("mongoose");
const domain_1 = require("../../core/domain");
exports.INTERACTION_TYPES = ["checkbox", "hold"];
const TodoSchema = new mongoose_1.Schema({
    text: {
        type: String,
        required: [true, "Please add a task description"],
        trim: true,
        maxlength: [500, "Task description must be at most 500 characters"],
    },
    completed: { type: Boolean, default: false },
    recurrenceType: {
        type: String,
        enum: domain_1.RECURRENCE_TYPES,
        default: "none",
    },
    lastCompletedAt: { type: Date, required: false },
    completionCount: { type: Number, default: 0, min: 0 },
    interactionType: {
        type: String,
        enum: exports.INTERACTION_TYPES,
        default: "checkbox",
    },
    durationGoal: { type: Number, default: 0, min: 0 },
    paused: { type: Boolean, default: false },
    pausedAt: { type: Date, required: false },
    userId: { type: String, required: true },
}, { timestamps: true });
// Serves the dashboard query (active todos for a user) and the paused panel.
TodoSchema.index({ userId: 1, paused: 1, createdAt: -1 });
const Todo = (0, mongoose_1.model)("Todo", TodoSchema);
exports.default = Todo;
//# sourceMappingURL=todo.model.js.map