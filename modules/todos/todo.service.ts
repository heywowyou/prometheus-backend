import type { HydratedDocument } from "mongoose";
import Todo, { type ITodo, type InteractionType } from "./todo.model";
import TodoHistory from "./todo-history.model";
import { getNextResetTime, type RecurrenceType } from "../../core/domain";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors/AppError";

type TodoDoc = HydratedDocument<ITodo>;

/**
 * Whether a recurring todo's stored completion still applies to the current
 * cycle. A daily todo completed yesterday is stored as `completed: true` but is
 * due again today.
 */
const isCurrentlyComplete = (todo: ITodo, now = new Date()): boolean => {
  if (!todo.completed) return false;
  if (todo.recurrenceType === "none") return true;
  return now < getNextResetTime(todo.lastCompletedAt, todo.recurrenceType);
};

/**
 * The client-facing shape of a todo.
 *
 * `completed` is the *live* value rather than the stored one, so clients never
 * have to recompute recurrence rollover themselves. `completedCycleAt` exposes
 * the stored completion for history display.
 */
export interface TodoView extends Omit<ITodo, "completed"> {
  _id: string;
  completed: boolean;
  /** Set when the stored completion belongs to an elapsed cycle. */
  dueAgainSince?: Date;
}

export const toView = (todo: TodoDoc, now = new Date()): TodoView => {
  const live = isCurrentlyComplete(todo, now);
  const object = todo.toObject({ versionKey: false }) as ITodo & { _id: unknown };

  return {
    ...object,
    _id: String(todo._id),
    completed: live,
    ...(todo.completed && !live
      ? { dueAgainSince: getNextResetTime(todo.lastCompletedAt, todo.recurrenceType) }
      : {}),
  };
};

/** Loads a todo and asserts the caller owns it. */
const findOwned = async (id: string, userId: string): Promise<TodoDoc> => {
  const todo = await Todo.findById(id);
  if (!todo) throw new NotFoundError("Todo");
  if (todo.userId !== userId) throw new ForbiddenError();
  return todo;
};

export const listTodos = async (
  userId: string,
  opts: { paused?: boolean } = {},
): Promise<TodoView[]> => {
  const filter = opts.paused
    ? { userId, paused: true }
    : { userId, paused: { $ne: true } };

  const todos = await Todo.find(filter).sort({ createdAt: -1 });
  const now = new Date();
  return todos.map((todo) => toView(todo, now));
};

export interface CreateTodoInput {
  text: string;
  recurrenceType?: RecurrenceType;
  interactionType?: InteractionType;
  durationGoal?: number;
}

export const createTodo = async (
  input: CreateTodoInput,
  userId: string,
): Promise<TodoView> => {
  const todo = await Todo.create({
    text: input.text,
    userId,
    recurrenceType: input.recurrenceType ?? "none",
    interactionType: input.interactionType ?? "checkbox",
    durationGoal: input.durationGoal ?? 0,
  });
  return toView(todo);
};

export type UpdateTodoInput = Partial<CreateTodoInput>;

export const updateTodo = async (
  id: string,
  userId: string,
  input: UpdateTodoInput,
): Promise<TodoView> => {
  const todo = await findOwned(id, userId);

  if (input.text !== undefined) todo.text = input.text;
  if (input.interactionType !== undefined) {
    todo.interactionType = input.interactionType;
  }
  if (input.durationGoal !== undefined) todo.durationGoal = input.durationGoal;

  if (input.recurrenceType !== undefined && input.recurrenceType !== todo.recurrenceType) {
    // Dropping recurrence discards the streak, which no longer has a meaning.
    if (input.recurrenceType === "none") {
      await TodoHistory.deleteMany({ todoId: todo._id });
      todo.completionCount = 0;
    }
    todo.recurrenceType = input.recurrenceType;
  }

  await todo.save();
  return toView(todo);
};

/**
 * Flips a todo's completion.
 *
 * A recurring todo whose cycle has already elapsed completes again (starting a
 * new cycle) rather than un-completing, which is what the user means when they
 * tick a daily task that reads as incomplete.
 */
export const toggleTodo = async (
  id: string,
  userId: string,
): Promise<TodoView> => {
  const todo = await findOwned(id, userId);
  const now = new Date();
  const isRecurring = todo.recurrenceType !== "none";

  if (isCurrentlyComplete(todo, now)) {
    todo.completed = false;

    if (isRecurring) {
      const latest = await TodoHistory.findOne({
        todoId: todo._id,
        userId,
      }).sort({ completedAt: -1 });

      if (latest) {
        todo.completionCount = Math.max(0, todo.completionCount - 1);
        await TodoHistory.findByIdAndDelete(latest._id);
      }
    }

    if (!isRecurring || todo.completionCount === 0) {
      todo.lastCompletedAt = undefined;
    }
  } else {
    todo.completed = true;
    todo.lastCompletedAt = now;

    if (isRecurring) {
      todo.completionCount += 1;
      await TodoHistory.create({
        todoId: todo._id,
        userId,
        completedAt: now,
        tallySnapshot: todo.completionCount,
      });
    }
  }

  await todo.save();
  return toView(todo, now);
};

export const pauseTodo = async (
  id: string,
  userId: string,
): Promise<TodoView> => {
  const todo = await findOwned(id, userId);

  if (todo.recurrenceType === "none") {
    throw new BadRequestError("Only recurring todos can be paused");
  }

  todo.paused = true;
  todo.pausedAt = new Date();
  await todo.save();
  return toView(todo);
};

export const resumeTodo = async (
  id: string,
  userId: string,
): Promise<TodoView> => {
  const todo = await findOwned(id, userId);

  // Start a fresh cycle from now so a long pause doesn't leave the todo
  // immediately overdue.
  todo.paused = false;
  todo.pausedAt = undefined;
  todo.completed = false;
  todo.lastCompletedAt = new Date();
  await todo.save();
  return toView(todo);
};

export const deleteTodo = async (id: string, userId: string): Promise<void> => {
  const todo = await findOwned(id, userId);
  await TodoHistory.deleteMany({ todoId: todo._id });
  await todo.deleteOne();
};
