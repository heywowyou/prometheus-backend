const mongoose = require("mongoose");

const TodoSchema = mongoose.Schema(
  {
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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Todo", TodoSchema);

