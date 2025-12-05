const mongoose = require("mongoose");

const TodoHistorySchema = mongoose.Schema({
  todoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Todo",
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  // When this specific instance was completed
  completedAt: {
    type: Date,
    default: Date.now,
  },
  // Snapshot of the streak at this moment (useful for analytics/graphs later)
  streakSnapshot: {
    type: Number,
  },
});

module.exports = mongoose.model("TodoHistory", TodoHistorySchema);
