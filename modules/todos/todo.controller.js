const Todo = require("./todo.model");
const TodoHistory = require("./todo-history.model");

const getNextResetTime = (lastCompletedAt, type) => {
  if (!lastCompletedAt) return new Date(0);

  const date = new Date(lastCompletedAt);

  if (type === "daily") {
    date.setDate(date.getDate() + 1);
  } else if (type === "weekly") {
    const dayOfWeek = date.getDay();
    let daysUntilNextMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7;
    if (daysUntilNextMonday === 0) daysUntilNextMonday = 7;
    date.setDate(date.getDate() + daysUntilNextMonday);
  } else if (type === "monthly") {
    date.setMonth(date.getMonth() + 1);
    date.setDate(1);
  }

  date.setHours(0, 0, 0, 0);
  return date;
};

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

const createTodo = async (req, res) => {
  try {
    const { text, recurrenceType, interactionType, durationGoal } = req.body;

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
      interactionType: interactionType || "checkbox",
      durationGoal: durationGoal || 0,
    });
    res.status(201).json(todo);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating todo", error: error.message });
  }
};

const updateTodo = async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);

    if (!todo) {
      return res.status(404).json({ message: "Todo not found" });
    }
    if (todo.userId !== req.auth.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { text, recurrenceType, interactionType, durationGoal } = req.body;

    if (text) todo.text = text;
    if (recurrenceType) todo.recurrenceType = recurrenceType;
    if (interactionType) todo.interactionType = interactionType;
    if (durationGoal !== undefined) todo.durationGoal = durationGoal;

    let shouldUpdateStatus = false;
    let targetStatus = null;

    if (Object.keys(req.body).length === 0) {
      shouldUpdateStatus = true;
      targetStatus = !todo.completed;
    } else if (Object.prototype.hasOwnProperty.call(req.body, "completed")) {
      shouldUpdateStatus = true;
      targetStatus = req.body.completed;
    }

    if (shouldUpdateStatus) {
      let isCompleting = targetStatus;
      const now = new Date();

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

