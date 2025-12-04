const mongoose = require("mongoose");

// Define the structure of a Todo item
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
      // Defines the frequency for task regeneration
      enum: ["none", "daily", "weekly", "monthly"],
      default: "none",
    },
    // The specific date/time the current task instance was completed
    lastCompletedAt: {
      type: Date,
      required: false,
    },
    // The ID of the original task this recurring task was cloned from
    originalTodoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Todo",
      required: false,
    },

    // The unique ID of the user who owns this task (from Clerk)
    userId: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  }
);

// Export the Model
module.exports = mongoose.model("Todo", TodoSchema);
