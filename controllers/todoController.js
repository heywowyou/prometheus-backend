const Todo = require("../models/Todo");
const TodoHistory = require("../models/TodoHistory");

// HELPER: Determine Reset Time (Matches Frontend Logic)
const getNextResetTime = (lastCompletedAt, type) => {
  if (!lastCompletedAt) return new Date(0);

  const date = new Date(lastCompletedAt);

  if (type === "daily") {
    // Set to midnight of the NEXT day
    date.setDate(date.getDate() + 1);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  // Default for future types
  return new Date(Date.now() + 3153600000000);
};

// @desc    Get all scoped todos
// @route   GET /api/todos
// @access  Private
const getTodos = async (req, res) => {
  try {
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
    const { text, recurrenceType } = req.body;

    if (!req.auth || !req.auth.userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    if (!text) {
      return res.status(400).json({ message: "Please add a text field" });
    }

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
    if (todo.userId !== req.auth.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // 1. Determine the intent. Default is a simple toggle.
    let isCompleting = !todo.completed;
    const now = new Date();

    // 2. RECURRENCE CHECK: If the task is already completed, but it's RECURRING,
    //    we must check if it's "stale" (past the reset time).
    //    If so, the user intends to COMPLETE IT AGAIN, not undo it.
    if (todo.completed && todo.recurrenceType !== "none") {
      const resetTime = getNextResetTime(
        todo.lastCompletedAt,
        todo.recurrenceType
      );

      if (now >= resetTime) {
        isCompleting = true;
      }
    }

    if (isCompleting) {
      // SCENARIO 1: COMPLETING TASK
      todo.completed = true;

      if (todo.recurrenceType !== "none") {
        todo.completionCount += 1;

        await TodoHistory.create({
          todoId: todo._id,
          userId: req.auth.userId,
          completedAt: now,
          tallySnapshot: todo.completionCount,
        });
      }

      todo.lastCompletedAt = now;
    } else {
      // SCENARIO 2: UN-COMPLETING (UNDO)
      todo.completed = false;

      if (todo.recurrenceType !== "none") {
        const latestHistory = await TodoHistory.findOne({
          todoId: todo._id,
        }).sort({ completedAt: -1 });

        if (latestHistory) {
          todo.completionCount -= 1;
          await TodoHistory.findByIdAndDelete(latestHistory._id);
        }
      }

      if (todo.completionCount === 0 || todo.recurrenceType === "none") {
        todo.lastCompletedAt = undefined;
      }
    }

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
    if (todo.userId !== req.auth.userId) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this task" });
    }

    if (todo.recurrenceType !== "none") {
      await TodoHistory.deleteMany({ todoId: todo._id });
    }

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
