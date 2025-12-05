const Todo = require("../models/Todo");
const TodoHistory = require("../models/TodoHistory"); // <--- NEW IMPORT

// @desc    Get all scoped todos
// @route   GET /api/todos
// @access  Private
const getTodos = async (req, res) => {
  try {
    // Find only todos where the userId matches the authenticated user's ID
    const todos = await Todo.find({ userId: req.auth.userId });
    res.status(200).json(todos);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching todos", error: error.message });
  }
};

// @desc    Create a new scoped todo
// @route   POST /api/todos
// @access  Private
const createTodo = async (req, res) => {
  try {
    // Destructure text and recurrenceType from the request body
    const { text, recurrenceType } = req.body;

    // Check if the authenticated user ID is available
    if (!req.auth || !req.auth.userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (!text) {
      return res.status(400).json({ message: "Please add a text field" });
    }

    // Pass recurrenceType to the database creation
    const todo = await Todo.create({
      text,
      userId: req.auth.userId,
      recurrenceType: recurrenceType || "none",
    });
    res.status(201).json(todo);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating todo", error: error.message });
  }
};

// @desc    Update a scoped todo
// @route   PUT /api/todos/:id
// @access  Private
const updateTodo = async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);

    if (!todo) {
      return res.status(404).json({ message: "Todo not found" });
    }

    // Security Check
    if (todo.userId !== req.auth.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Are we turning it ON or OFF? (Defines intent)
    const isCompleting = !todo.completed;

    if (isCompleting) {
      // SCENARIO 1: COMPLETING TASK (Increment Tally)
      todo.completed = true;
      const now = new Date();

      if (todo.recurrenceType !== "none") {
        // Increment the total completion tally
        todo.completionCount += 1;

        // Create History Archive
        await TodoHistory.create({
          todoId: todo._id,
          userId: req.auth.userId,
          completedAt: now,
          tallySnapshot: todo.completionCount, // Log the new tally
        });
      }

      // Always update the timestamp
      todo.lastCompletedAt = now;
    } else {
      // SCENARIO 2: UN-COMPLETING (UNDO)
      todo.completed = false;

      if (todo.recurrenceType !== "none") {
        // Find the most recent history entry to delete it
        const latestHistory = await TodoHistory.findOne({
          todoId: todo._id,
        }).sort({ completedAt: -1 });

        if (latestHistory) {
          // Decrement the tally to reflect the undo
          todo.completionCount -= 1;
          await TodoHistory.findByIdAndDelete(latestHistory._id);
        }
      }

      // Since the frontend handles the visual reset, we just clear the last completed time on undo
      if (todo.completionCount === 0 || todo.recurrenceType === "none") {
        todo.lastCompletedAt = undefined;
      }
    }

    // Save the updated state of the task
    await todo.save();
    res.status(200).json(todo);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Error updating todo", error: error.message });
  }
};

// @desc    Delete a scoped todo
// @route   DELETE /api/todos/:id
// @access  Private
const deleteTodo = async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);

    if (!todo) {
      return res.status(404).json({ message: "Todo not found" });
    }

    // Ensure the todo belongs to the authenticated user
    if (todo.userId !== req.auth.userId) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this task" });
    }

    // Cleanup: Delete all associated history records
    if (todo.recurrenceType !== "none") {
      await TodoHistory.deleteMany({ todoId: todo._id });
    }

    // Delete the main task document
    await todo.deleteOne();

    res
      .status(200)
      .json({ id: req.params.id, message: "Todo successfully deleted" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting todo", error: error.message });
  }
};

module.exports = {
  getTodos,
  createTodo,
  updateTodo,
  deleteTodo,
};
