"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const TodoHistorySchema = new mongoose_1.Schema({
    todoId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Todo",
        required: true,
    },
    userId: {
        type: String,
        required: true,
    },
    completedAt: {
        type: Date,
        default: Date.now,
    },
    streakSnapshot: {
        type: Number,
    },
});
const TodoHistory = (0, mongoose_1.model)("TodoHistory", TodoHistorySchema);
exports.default = TodoHistory;
