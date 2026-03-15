"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const TodoSchema = new mongoose_1.Schema({
    text: {
        type: String,
        required: [true, "Please add a task description"],
        trim: true,
    },
    completed: {
        type: Boolean,
        default: false,
    },
    recurrenceType: {
        type: String,
        enum: ["none", "daily", "weekly", "monthly"],
        default: "none",
    },
    lastCompletedAt: {
        type: Date,
        required: false,
    },
    completionCount: { type: Number, default: 0 },
    interactionType: {
        type: String,
        enum: ["checkbox", "hold"],
        default: "checkbox",
    },
    durationGoal: {
        type: Number,
        default: 0,
    },
    userId: {
        type: String,
        required: true,
    },
}, {
    timestamps: true,
});
const Todo = (0, mongoose_1.model)("Todo", TodoSchema);
exports.default = Todo;
