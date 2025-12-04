const Todo = require("../models/Todo");

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
    const { text } = req.body;

    // Check if the authenticated user ID is available
    if (!req.auth || !req.auth.userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (!text) {
      return res.status(400).json({ message: "Please add a text field" });
    }

    // Add the userId to the document before creation
    const todo = await Todo.create({
      text,
      userId: req.auth.userId,
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
      return res
        .status(403)
        .json({ message: "Not authorized to modify this task" });
    }

    let taskToReturn = todo; // Default: return the updated existing task

    if (todo.completed || todo.recurrenceType === "none") {
      // Path 1: Simple Toggle (Undo completion or non-recurring task)
      todo.completed = !todo.completed;
      todo.lastCompletedAt = todo.completed ? new Date() : undefined;
    } else if (!todo.completed && todo.recurrenceType !== "none") {
      // Path 2: Completion of a Recurring Task (Clone Path)

      // Mark the current task as completed with a timestamp
      todo.completed = true;
      todo.lastCompletedAt = new Date();

      // Clone the next instance
      const todoClone = await Todo.create({
        userId: todo.userId,
        text: todo.text,
        recurrenceType: todo.recurrenceType,
        // Link the new clone back to the original instance's ID
        originalTodoId: todo._id,
      });

      taskToReturn = todoClone;
    }

    // Save the current (now completed) task to the database
    await todo.save();

    // Send back the correct task (either the simple update, or the newly cloned instance)
    res.status(200).json(taskToReturn);
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

    // Use deleteOne on the document instance for Mongoose simplicity
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
