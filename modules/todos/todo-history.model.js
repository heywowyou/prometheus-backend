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
  completedAt: {
    type: Date,
    default: Date.now,
  },
  streakSnapshot: {
    type: Number,
  },
});

module.exports = mongoose.model("TodoHistory", TodoHistorySchema);

