const Todo = require("../models/Todo");
const TodoHistory = require("../models/TodoHistory");

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
    const { text, recurrenceType } = req.body;

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

    // Are we turning it ON or OFF?
    const isCompleting = !todo.completed;

    // Completing task
    if (isCompleting) {
      todo.completed = true;
      const now = new Date();

      // Streak Logic for Recurring Tasks
      if (todo.recurrenceType !== "none") {
        const lastDate = todo.lastCompletedAt
          ? new Date(todo.lastCompletedAt)
          : null;

        // Check if last completion was "Yesterday" (Consecutive)
        // Simple logic: Reset time is midnight. If now < resetTime(lastDate + 2 days), it's consecutive.
        let isConsecutive = false;

        if (lastDate) {
          // 1. Normalize Today's date to midnight
          const todayNormalized = new Date(now);
          todayNormalized.setHours(0, 0, 0, 0); // Today at 00:00

          // 2. Normalize Last Completed Date to midnight
          const lastDateNormalized = new Date(lastDate);
          lastDateNormalized.setHours(0, 0, 0, 0); // Last completion day at 00:00

          // Calculate the difference in full days
          const diffTime = Math.abs(
            todayNormalized.getTime() - lastDateNormalized.getTime()
          );
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Round up for full day difference

          // The task is consecutive if the last completion was today (diffDays=0)
          // OR if it was yesterday (diffDays=1).
          // The frontend prevents us from completing the task before the reset, so diffDays > 1 means a gap.
          if (diffDays <= 1) {
            isConsecutive = true;
          }
        }

        if (isConsecutive) {
          todo.currentStreak += 1;
        } else {
          // Gap detected (or first time), reset to 1
          todo.currentStreak = 1;
        }

        // Update Longest Streak
        if (todo.currentStreak > todo.longestStreak) {
          todo.longestStreak = todo.currentStreak;
        }

        // Create History Archive
        await TodoHistory.create({
          todoId: todo._id,
          userId: req.auth.userId,
          completedAt: now,
          streakSnapshot: todo.currentStreak,
        });
      }

      // Always update the timestamp
      todo.lastCompletedAt = now;
    }

    // Un-completing task
    else {
      todo.completed = false;

      if (todo.recurrenceType !== "none") {
        // Find the most recent history entry to delete it
        const latestHistory = await TodoHistory.findOne({
          todoId: todo._id,
        }).sort({ completedAt: -1 });

        if (latestHistory) {
          await TodoHistory.findByIdAndDelete(latestHistory._id);
        }

        // Restore state from the *previous* history entry
        const previousHistory = await TodoHistory.findOne({
          todoId: todo._id,
        }).sort({ completedAt: -1 });

        if (previousHistory) {
          // Revert to previous state
          todo.currentStreak = previousHistory.streakSnapshot;
          todo.lastCompletedAt = previousHistory.completedAt;
        } else {
          // No history left? Reset to zero.
          todo.currentStreak = 0;
          todo.lastCompletedAt = undefined;
        }
      } else {
        // Non-recurring undo
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
