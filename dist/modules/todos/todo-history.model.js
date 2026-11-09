"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const TodoHistorySchema = new mongoose_1.Schema({
    todoId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Todo",
        required: true,
        index: true,
    },
    userId: { type: String, required: true },
    completedAt: { type: Date, default: Date.now },
    tallySnapshot: { type: Number },
});
// Supports "most recent completion for this todo", used when undoing a toggle.
TodoHistorySchema.index({ todoId: 1, completedAt: -1 });
const TodoHistory = (0, mongoose_1.model)("TodoHistory", TodoHistorySchema);
exports.default = TodoHistory;
//# sourceMappingURL=todo-history.model.js.map