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

// @desc    Update a todo status (e.g., toggle completed)
// @route   PUT /api/todos/:id
// @access  Public
const updateTodo = async (req, res) => {
  try {
    // 1. Find the todo by its ID from the URL parameters
    const todo = await Todo.findById(req.params.id);

    if (!todo) {
      return res.status(404).json({ message: "Todo not found" });
    }

    // 2. Toggle the completed status
    todo.completed = !todo.completed;

    // 3. Save the updated todo
    const updatedTodo = await todo.save();

    res.status(200).json(updatedTodo); // Send back the updated object
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating todo", error: error.message });
  }
};

// @desc    Delete a todo
// @route   DELETE /api/todos/:id
// @access  Public
const deleteTodo = async (req, res) => {
  try {
    // Find the todo by ID and delete it
    const deletedTodo = await Todo.findByIdAndDelete(req.params.id);

    if (!deletedTodo) {
      return res.status(404).json({ message: "Todo not found" });
    }

    // Send a success message or the ID of the deleted item
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
