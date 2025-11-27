const Todo = require("../models/Todo");

// @desc    Get all todos
// @route   GET /api/todos
// @access  Public (Will be Private/Protected later with Clerk)
const getTodos = async (req, res) => {
  try {
    const todos = await Todo.find({}); // Find all documents in the Todo collection
    res.status(200).json(todos); // Send back the status and the list of todos
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching todos", error: error.message });
  }
};

// @desc    Create a new todo
// @route   POST /api/todos
// @access  Public (Will be Private/Protected later with Clerk)
const createTodo = async (req, res) => {
  try {
    const { text } = req.body; // Destructure the text field from the request body

    if (!text) {
      // Input validation
      return res.status(400).json({ message: "Please add a text field" });
    }

    const todo = await Todo.create({ text }); // Create a new document in the database
    res.status(201).json(todo); // Send back the status (201 Created) and the new todo item
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating todo", error: error.message });
  }
};

module.exports = {
  getTodos,
  createTodo,
};
