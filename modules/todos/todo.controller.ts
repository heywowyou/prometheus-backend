import type { Request, Response } from "express";
import Todo from "./todo.model";
import TodoHistory from "./todo-history.model";
import { getNextResetTime, type RecurrenceType } from "../../core/domain/recurrence";

interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
  };
}

const getUserId = (req: AuthenticatedRequest): string | null =>
  req.auth?.userId ?? null;

export const getTodos = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const todos = await Todo.find({ userId });
    return res.status(200).json(todos);
  } catch (error) {
    const err = error as Error;
    return res
      .status(500)
      .json({ message: "Error fetching todos", error: err.message });
  }
};

export const createTodo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { text, recurrenceType, interactionType, durationGoal } = req.body as {
      text?: string;
      recurrenceType?: RecurrenceType;
      interactionType?: "checkbox" | "hold";
      durationGoal?: number;
    };

    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    if (!text) {
      return res.status(400).json({ message: "Please add a text field" });
    }

    const todo = await Todo.create({
      text,
      userId,
      recurrenceType: recurrenceType ?? "none",
      interactionType: interactionType ?? "checkbox",
      durationGoal: durationGoal ?? 0,
    });
    return res.status(201).json(todo);
  } catch (error) {
    const err = error as Error;
    return res
      .status(500)
      .json({ message: "Error creating todo", error: err.message });
  }
};

export const updateTodo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const todo = await Todo.findById(req.params.id);

    if (!todo) {
      return res.status(404).json({ message: "Todo not found" });
    }

    const userId = getUserId(req);
    if (!userId || todo.userId !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { text, recurrenceType, interactionType, durationGoal } = req.body as {
      text?: string;
      recurrenceType?: RecurrenceType;
      interactionType?: "checkbox" | "hold";
      durationGoal?: number;
      completed?: boolean;
    };

    if (text) todo.text = text;
    if (recurrenceType) todo.recurrenceType = recurrenceType;
    if (interactionType) todo.interactionType = interactionType;
    if (durationGoal !== undefined) todo.durationGoal = durationGoal;

    let shouldUpdateStatus = false;
    let targetStatus: boolean | null = null;

    if (Object.keys(req.body as object).length === 0) {
      shouldUpdateStatus = true;
      targetStatus = !todo.completed;
    } else if (Object.prototype.hasOwnProperty.call(req.body, "completed")) {
      shouldUpdateStatus = true;
      targetStatus = (req.body as { completed: boolean }).completed;
    }

    if (shouldUpdateStatus && targetStatus !== null) {
      let isCompleting = targetStatus;
      const now = new Date();

      if (todo.completed && todo.recurrenceType !== "none") {
        const resetTime = getNextResetTime(
          todo.lastCompletedAt ?? undefined,
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
            userId,
            completedAt: now,
            tallySnapshot: todo.completionCount,
          } as any);
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
    return res.status(200).json(todo);
  } catch (error) {
    const err = error as Error;
    // eslint-disable-next-line no-console
    console.error(err);
    return res
      .status(500)
      .json({ message: "Error updating todo", error: err.message });
  }
};

export const deleteTodo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const todo = await Todo.findById(req.params.id);

    if (!todo) {
      return res.status(404).json({ message: "Todo not found" });
    }

    const userId = getUserId(req);
    if (!userId || todo.userId !== userId) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this task" });
    }

    if (todo.recurrenceType !== "none") {
      await TodoHistory.deleteMany({ todoId: todo._id });
    }

    await todo.deleteOne();
    return res
      .status(200)
      .json({ id: req.params.id, message: "Todo successfully deleted" });
  } catch (error) {
    const err = error as Error;
    return res
      .status(500)
      .json({ message: "Error deleting todo", error: err.message });
  }
};

