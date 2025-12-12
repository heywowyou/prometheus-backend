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
    // Total number of times this task was completed
    completionCount: { type: Number, default: 0 },
    // Tactile habits
    interactionType: {
      type: String,
      // 'checkbox' = standard click
      // 'hold' = long press to fill (3 seconds)
      enum: ["checkbox", "hold"],
      default: "checkbox",
    },
    durationGoal: {
      type: Number, // The label to display (e.g. 10 for "10 mins")
      default: 0,
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
