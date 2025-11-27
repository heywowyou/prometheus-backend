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
    // Will add the 'user' field later during Clerk integration
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  }
);

// Export the Model
module.exports = mongoose.model("Todo", TodoSchema);
