const Todo = require("../models/Todo");
const TodoHistory = require("../models/TodoHistory");

// HELPER: Determine Reset Time
const getNextResetTime = (lastCompletedAt, type) => {
  if (!lastCompletedAt) return new Date(0); // Always active if never done

  const date = new Date(lastCompletedAt);

  // 1. Daily: Reset at midnight of the NEXT day
  if (type === "daily") {
    date.setDate(date.getDate() + 1);
  }

  // 2. Weekly: Reset at midnight of the NEXT Monday
  else if (type === "weekly") {
    const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    let daysUntilNextMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7; // If Monday (1), go 7 days. Otherwise, calculate days to next Monday.

    // If the task was completed today (Monday), the reset is next Monday (7 days later).
    if (daysUntilNextMonday === 0) {
      daysUntilNextMonday = 7;
    }

    date.setDate(date.getDate() + daysUntilNextMonday);
  }

  // 3. Monthly: Reset at midnight of the 1st day of the NEXT month
  else if (type === "monthly") {
    date.setMonth(date.getMonth() + 1);
    date.setDate(1); // Set to the 1st of the new month
  }

  // Normalize to Midnight (00:00:00)
  date.setHours(0, 0, 0, 0);
  return date;
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

    // 2. Recurrence check
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
      // Completing task
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
      // Un-completing task
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
