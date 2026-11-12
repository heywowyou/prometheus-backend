import type { HydratedDocument, Types } from "mongoose";
import Todo, { type ITodo, type InteractionType } from "./todo.model";
import TodoHistory from "./todo-history.model";
import { computeStreak, type Streak } from "./todo.streak";
import {
  getNextResetTime,
  localDateKey,
  type RecurrenceType,
} from "../../core/domain";
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
const isCurrentlyComplete = (
  todo: ITodo,
  timeZone: string,
  now = new Date(),
): boolean => {
  if (!todo.completed) return false;
  if (todo.recurrenceType === "none") return true;
  return (
    now < getNextResetTime(todo.lastCompletedAt, todo.recurrenceType, timeZone)
  );
};

/**
 * Timer progress banked before the current run. Progress from an earlier,
 * elapsed cycle doesn't count towards this one (yesterday's 20 minutes of a
 * daily 30-minute task don't carry over); a timer left running across
 * midnight keeps counting.
 */
const bankedMs = (todo: ITodo, timeZone: string, now: Date): number => {
  if (todo.timerStartedAt || !todo.timerUpdatedAt) return todo.timerElapsedMs ?? 0;
  if (todo.recurrenceType === "none") return todo.timerElapsedMs ?? 0;
  const resetAt = getNextResetTime(todo.timerUpdatedAt, todo.recurrenceType, timeZone);
  return now >= resetAt ? 0 : (todo.timerElapsedMs ?? 0);
};

/** Banked plus the running session, as of `now`. */
const liveElapsedMs = (todo: ITodo, timeZone: string, now: Date): number =>
  bankedMs(todo, timeZone, now) +
  (todo.timerStartedAt ? Math.max(0, now.getTime() - todo.timerStartedAt.getTime()) : 0);

/**
 * The client-facing shape of a todo.
 *
 * `completed` is the *live* value rather than the stored one, so clients never
 * have to recompute recurrence rollover themselves. Cycle boundaries are
 * midnights in the caller's `timeZone`.
 */
export interface TodoView
  extends Omit<ITodo, "completed" | "timerElapsedMs" | "timerStartedAt" | "timerUpdatedAt"> {
  _id: string;
  completed: boolean;
  /** Set when the stored completion belongs to an elapsed cycle. */
  dueAgainSince?: Date;
  /**
   * Timer tasks only. The client shows `elapsedMs + (now − startedAt)` while
   * `startedAt` is set.
   */
  timer?: { elapsedMs: number; startedAt?: Date };
  /** Recurring tasks only. */
  streak?: Streak;
}

export const toView = (
  todo: TodoDoc,
  timeZone: string,
  now = new Date(),
  streak?: Streak,
): TodoView => {
  const live = isCurrentlyComplete(todo, timeZone, now);
  const {
    timerElapsedMs: _elapsed,
    timerStartedAt: _started,
    timerUpdatedAt: _updated,
    ...object
  } = todo.toObject({ versionKey: false }) as ITodo & { _id: unknown };

  return {
    ...object,
    _id: String(todo._id),
    completed: live,
    ...(todo.completed && !live
      ? {
          dueAgainSince: getNextResetTime(
            todo.lastCompletedAt,
            todo.recurrenceType,
            timeZone,
          ),
        }
      : {}),
    ...(todo.interactionType === "timer"
      ? {
          timer: {
            elapsedMs: bankedMs(todo, timeZone, now),
            ...(todo.timerStartedAt ? { startedAt: todo.timerStartedAt } : {}),
          },
        }
      : {}),
    ...(streak ? { streak } : {}),
  };
};

/** Completion dates per todo id, for streaks. */
const completionsByTodo = async (
  userId: string,
  todoIds: Types.ObjectId[],
): Promise<Map<string, Date[]>> => {
  const map = new Map<string, Date[]>();
  if (todoIds.length === 0) return map;

  const rows = await TodoHistory.find(
    { userId, todoId: { $in: todoIds } },
    { todoId: 1, completedAt: 1 },
  ).lean();

  for (const row of rows) {
    const key = String(row.todoId);
    const list = map.get(key) ?? [];
    list.push(row.completedAt);
    map.set(key, list);
  }
  return map;
};

/** A single todo's view, with its streak when it recurs. */
const viewOf = async (
  todo: TodoDoc,
  timeZone: string,
  now = new Date(),
): Promise<TodoView> => {
  if (todo.recurrenceType === "none") return toView(todo, timeZone, now);
  const completions = (await completionsByTodo(todo.userId, [todo._id])).get(
    String(todo._id),
  );
  return toView(
    todo,
    timeZone,
    now,
    computeStreak(completions ?? [], todo.recurrenceType, timeZone, now),
  );
};

/** Loads a todo and asserts the caller owns it. */
const findOwned = async (id: string, userId: string): Promise<TodoDoc> => {
  const todo = await Todo.findById(id);
  if (!todo) throw new NotFoundError("Todo");
  if (todo.userId !== userId) throw new ForbiddenError();
  return todo;
};

const assertValidMode = (todo: ITodo) => {
  if (todo.interactionType === "timer" && todo.durationGoal < 1) {
    throw new BadRequestError("A timed task needs a target of at least 1 minute");
  }
};

/** Stops a running timer, banking the session. */
const stopTimer = (todo: TodoDoc, timeZone: string, now: Date) => {
  todo.timerElapsedMs = liveElapsedMs(todo, timeZone, now);
  todo.timerStartedAt = undefined;
  todo.timerUpdatedAt = now;
};

export const listTodos = async (
  userId: string,
  opts: { paused?: boolean; timeZone: string },
): Promise<TodoView[]> => {
  const filter = opts.paused
    ? { userId, paused: true }
    : { userId, paused: { $ne: true } };

  const todos = await Todo.find(filter).sort({ createdAt: -1 });
  const now = new Date();

  const recurring = todos.filter((todo) => todo.recurrenceType !== "none");
  const completions = await completionsByTodo(
    userId,
    recurring.map((todo) => todo._id),
  );

  return todos.map((todo) =>
    toView(
      todo,
      opts.timeZone,
      now,
      todo.recurrenceType === "none"
        ? undefined
        : computeStreak(
            completions.get(String(todo._id)) ?? [],
            todo.recurrenceType,
            opts.timeZone,
            now,
          ),
    ),
  );
};

export interface CreateTodoInput {
  text: string;
  recurrenceType?: RecurrenceType;
  interactionType?: InteractionType;
  durationGoal?: number;
  /** One-time tasks only; ignored for recurring ones. */
  dueDate?: string;
}

export const createTodo = async (
  input: CreateTodoInput,
  userId: string,
  timeZone: string,
): Promise<TodoView> => {
  const recurrenceType = input.recurrenceType ?? "none";
  // New tasks go to the bottom of their section.
  const last = await Todo.findOne({ userId, recurrenceType, order: { $ne: null } })
    .sort({ order: -1 })
    .select({ order: 1 })
    .lean();

  const todo = new Todo({
    text: input.text,
    userId,
    order: (last?.order ?? -1) + 1,
    recurrenceType: input.recurrenceType ?? "none",
    interactionType: input.interactionType ?? "checkbox",
    durationGoal: input.durationGoal ?? 0,
    ...(input.recurrenceType && input.recurrenceType !== "none"
      ? {}
      : { dueDate: input.dueDate }),
  });
  assertValidMode(todo);
  await todo.save();
  return viewOf(todo, timeZone);
};

export type UpdateTodoInput = Partial<Omit<CreateTodoInput, "dueDate">> & {
  /** `null` clears the due date. */
  dueDate?: string | null;
};

export const updateTodo = async (
  id: string,
  userId: string,
  input: UpdateTodoInput,
  timeZone: string,
): Promise<TodoView> => {
  const todo = await findOwned(id, userId);
  const now = new Date();

  if (input.text !== undefined) todo.text = input.text;
  if (input.interactionType !== undefined) {
    // Leaving timer mode discards any half-done session.
    if (input.interactionType !== "timer" && todo.interactionType === "timer") {
      todo.timerElapsedMs = 0;
      todo.timerStartedAt = undefined;
      todo.timerUpdatedAt = now;
    }
    todo.interactionType = input.interactionType;
  }
  if (input.durationGoal !== undefined) todo.durationGoal = input.durationGoal;
  assertValidMode(todo);

  if (input.recurrenceType !== undefined && input.recurrenceType !== todo.recurrenceType) {
    // Dropping recurrence discards the history, which no longer has a meaning.
    if (input.recurrenceType === "none") {
      await TodoHistory.deleteMany({ todoId: todo._id });
      todo.completionCount = 0;
    }
    todo.recurrenceType = input.recurrenceType;
  }

  if (input.dueDate !== undefined) todo.dueDate = input.dueDate ?? undefined;
  // Recurring tasks are due every cycle; a fixed date would only mislead.
  if (todo.recurrenceType !== "none") todo.dueDate = undefined;

  await todo.save();
  return viewOf(todo, timeZone, now);
};

/**
 * Flips a todo's completion.
 *
 * A recurring todo whose cycle has already elapsed completes again (starting a
 * new cycle) rather than un-completing, which is what the user means when they
 * tick a daily task that reads as incomplete. Completing a timer task clears
 * its timer for the next cycle.
 */
export const toggleTodo = async (
  id: string,
  userId: string,
  timeZone: string,
): Promise<TodoView> => {
  const todo = await findOwned(id, userId);
  const now = new Date();
  const isRecurring = todo.recurrenceType !== "none";

  if (isCurrentlyComplete(todo, timeZone, now)) {
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

    if (todo.interactionType === "timer") {
      todo.timerElapsedMs = 0;
      todo.timerStartedAt = undefined;
      todo.timerUpdatedAt = now;
    }

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
  return viewOf(todo, timeZone, now);
};

/**
 * Saves a section's manual order: `ids[i]` gets position `i`. Every id must
 * belong to the caller, so a crafted list can't touch other users' todos.
 */
export const reorderTodos = async (userId: string, ids: string[]): Promise<void> => {
  const owned = await Todo.countDocuments({ _id: { $in: ids }, userId });
  if (owned !== ids.length) throw new NotFoundError("Todo");

  await Todo.bulkWrite(
    ids.map((id, index) => ({
      updateOne: { filter: { _id: id, userId }, update: { $set: { order: index } } },
    })),
  );
};

export const TIMER_ACTIONS = ["start", "pause", "reset"] as const;
export type TimerAction = (typeof TIMER_ACTIONS)[number];

/**
 * Starts, pauses or resets a timed task. State lives on the server so a timer
 * started on one device shows on every other. Completion is still a toggle:
 * the client calls it when the live time reaches the goal.
 */
export const updateTimer = async (
  id: string,
  userId: string,
  action: TimerAction,
  timeZone: string,
): Promise<TodoView> => {
  const todo = await findOwned(id, userId);
  const now = new Date();

  if (todo.interactionType !== "timer") {
    throw new BadRequestError("Only timed tasks have a timer");
  }

  switch (action) {
    case "start":
      if (isCurrentlyComplete(todo, timeZone, now)) {
        throw new BadRequestError("This task is already done for now");
      }
      if (!todo.timerStartedAt) {
        // Drop progress from an elapsed cycle before starting a new run.
        todo.timerElapsedMs = bankedMs(todo, timeZone, now);
        todo.timerStartedAt = now;
        todo.timerUpdatedAt = now;
      }
      break;
    case "pause":
      if (todo.timerStartedAt) stopTimer(todo, timeZone, now);
      break;
    case "reset":
      todo.timerElapsedMs = 0;
      todo.timerStartedAt = undefined;
      todo.timerUpdatedAt = now;
      break;
  }

  await todo.save();
  return viewOf(todo, timeZone, now);
};

export interface TodoHistoryView {
  streak: Streak;
  /** Completions ever recorded. */
  total: number;
  /** Completions per local calendar day within the window, oldest first. */
  days: Array<{ date: string; count: number }>;
}

/** A recurring todo's completion calendar, for the history heatmap. */
export const getTodoHistory = async (
  id: string,
  userId: string,
  days: number,
  timeZone: string,
): Promise<TodoHistoryView> => {
  const todo = await findOwned(id, userId);
  const now = new Date();

  const all = await TodoHistory.find(
    { todoId: todo._id, userId },
    { completedAt: 1 },
  )
    .sort({ completedAt: 1 })
    .lean();
  const dates = all.map((row) => row.completedAt);

  const since = now.getTime() - days * 86_400_000;
  const counts = new Map<string, number>();
  for (const date of dates) {
    if (date.getTime() < since) continue;
    const key = localDateKey(date, timeZone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return {
    streak: computeStreak(dates, todo.recurrenceType, timeZone, now),
    total: dates.length,
    days: [...counts].map(([date, count]) => ({ date, count })),
  };
};

export const pauseTodo = async (
  id: string,
  userId: string,
  timeZone: string,
): Promise<TodoView> => {
  const todo = await findOwned(id, userId);
  const now = new Date();

  if (todo.recurrenceType === "none") {
    throw new BadRequestError("Only recurring todos can be paused");
  }

  if (todo.timerStartedAt) stopTimer(todo, timeZone, now);
  todo.paused = true;
  todo.pausedAt = now;
  await todo.save();
  return viewOf(todo, timeZone, now);
};

export const resumeTodo = async (
  id: string,
  userId: string,
  timeZone: string,
): Promise<TodoView> => {
  const todo = await findOwned(id, userId);

  // Start a fresh cycle from now so a long pause doesn't leave the todo
  // immediately overdue.
  todo.paused = false;
  todo.pausedAt = undefined;
  todo.completed = false;
  todo.lastCompletedAt = new Date();
  await todo.save();
  return viewOf(todo, timeZone);
};

export const deleteTodo = async (id: string, userId: string): Promise<void> => {
  const todo = await findOwned(id, userId);
  await TodoHistory.deleteMany({ todoId: todo._id });
  await todo.deleteOne();
};
