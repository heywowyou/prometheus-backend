import { Types, type HydratedDocument } from "mongoose";
import Todo, { type ITodo, type InteractionType } from "./todo.model";
import TodoHistory from "./todo-history.model";
import { TodoArea, TodoProject } from "./todo-list.model";
import { advanceRepeat, addDays, daysBetween, DAY_PATTERN, type RepeatRule } from "./repeat";
import { normaliseTags } from "../notes/note.text";
import { computeStreak, type Streak } from "../../core/domain";
import {
  getNextResetTime,
  localDateKey,
  zonedInstant,
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
  const now = new Date();
  // Done tasks stay in their lists until the end of the day, then live in the Logbook.
  const startOfToday = zonedInstant(localDateKey(now, opts.timeZone), "00:00", opts.timeZone);
  const filter = opts.paused
    ? { userId, paused: true }
    : {
        userId,
        paused: { $ne: true },
        $or: [
          { recurrenceType: { $ne: "none" as const } },
          { completedAt: null },
          { completedAt: { $gte: startOfToday } },
        ],
      };

  const todos = await Todo.find(filter).sort({ createdAt: -1 });

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

/** Fields only tasks use (habits ignore the schedule ones). `null` clears. */
export interface TaskFieldsInput {
  notes?: string;
  checklist?: Array<{ _id?: string; text: string; done: boolean }>;
  areaId?: string | null;
  projectId?: string | null;
  headingId?: string | null;
  tags?: string[];
  important?: boolean;
  when?: string | null;
  evening?: boolean;
  time?: string | null;
  repeat?: RepeatRule | null;
}

export interface CreateTodoInput extends TaskFieldsInput {
  text: string;
  recurrenceType?: RecurrenceType;
  interactionType?: InteractionType;
  durationGoal?: number;
  /** One-time tasks only; ignored for recurring ones. */
  dueDate?: string;
}

const isDay = (value: string | null | undefined): boolean =>
  typeof value === "string" && DAY_PATTERN.test(value);

const assertOwnedList = async (
  kind: "area" | "project",
  id: string,
  userId: string,
) => {
  if (!Types.ObjectId.isValid(id)) throw new BadRequestError(`${kind}Id is not a valid id`);
  const exists =
    kind === "area"
      ? await TodoArea.exists({ _id: id, userId })
      : await TodoProject.exists({ _id: id, userId });
  if (!exists) throw new NotFoundError(kind === "area" ? "Area" : "Project");
};

/** Recomputes the reminder instant after `when`, `time` or the zone change. */
const syncReminder = (todo: TodoDoc) => {
  const at =
    todo.recurrenceType === "none" && !todo.completedAt && isDay(todo.when) && todo.time && todo.timeZone
      ? zonedInstant(todo.when as string, todo.time, todo.timeZone)
      : null;
  const changed = (todo.reminderAt?.getTime() ?? null) !== (at?.getTime() ?? null);
  todo.reminderAt = at;
  if (changed) todo.reminderSentAt = null;
};

/**
 * Applies the task fields of a create or update. Keeps them consistent: a
 * project and an area are exclusive (the project carries its area), a time
 * or a repeat needs a start day, someday drops the time.
 */
const applyTaskFields = async (
  todo: TodoDoc,
  input: TaskFieldsInput,
  userId: string,
  timeZone: string,
) => {
  const today = localDateKey(new Date(), timeZone);

  if (input.notes !== undefined) todo.notes = input.notes;
  if (input.tags !== undefined) todo.tags = normaliseTags(input.tags);
  if (input.important !== undefined) todo.important = input.important;
  if (input.checklist !== undefined) {
    todo.set(
      "checklist",
      input.checklist.slice(0, 200).map((item) => ({
        ...(item._id && Types.ObjectId.isValid(item._id) ? { _id: item._id } : {}),
        text: item.text.slice(0, 500),
        done: Boolean(item.done),
      })),
    );
  }

  if (input.projectId !== undefined) {
    if (input.projectId) {
      await assertOwnedList("project", input.projectId, userId);
      if (String(todo.projectId) !== input.projectId) todo.headingId = null;
      todo.projectId = new Types.ObjectId(input.projectId);
      todo.areaId = null;
    } else {
      todo.projectId = null;
      todo.headingId = null;
    }
  }
  if (input.areaId !== undefined) {
    if (input.areaId) {
      await assertOwnedList("area", input.areaId, userId);
      todo.areaId = new Types.ObjectId(input.areaId);
      todo.projectId = null;
      todo.headingId = null;
    } else {
      todo.areaId = null;
    }
  }
  if (input.headingId !== undefined) {
    if (input.headingId) {
      const project = todo.projectId ? await TodoProject.findOne({ _id: todo.projectId, userId }) : null;
      if (!project?.headings.some((heading) => String(heading._id) === input.headingId)) {
        throw new BadRequestError("headingId must be a heading of the task's project");
      }
      todo.headingId = new Types.ObjectId(input.headingId);
    } else {
      todo.headingId = null;
    }
  }

  // Schedule fields only mean something on tasks.
  if (todo.recurrenceType !== "none") return;

  if (input.when !== undefined) todo.when = input.when;
  if (input.evening !== undefined) todo.evening = input.evening;
  if (input.time !== undefined) {
    todo.time = input.time;
    if (input.time) todo.timeZone = timeZone;
  }
  if (input.repeat !== undefined) todo.repeat = input.repeat;

  if ((todo.time || todo.repeat || todo.evening) && !isDay(todo.when)) {
    if (todo.when === "someday") {
      todo.time = null;
      todo.evening = false;
    } else {
      todo.when = today;
    }
  }
  if (!isDay(todo.when)) {
    todo.evening = false;
    todo.time = null;
  }
  syncReminder(todo);
};

export const createTodo = async (
  input: CreateTodoInput,
  userId: string,
  timeZone: string,
): Promise<TodoView> => {
  const recurrenceType = input.recurrenceType ?? "none";
  // New tasks go to the bottom of their list.
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
  await applyTaskFields(todo, input, userId, timeZone);
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

  // Switching between a habit and a task goes through convertTodo, which
  // keeps the history; this only changes a habit's cadence.
  if (
    input.recurrenceType !== undefined &&
    input.recurrenceType !== "none" &&
    todo.recurrenceType !== "none"
  ) {
    todo.recurrenceType = input.recurrenceType;
  }

  if (input.dueDate !== undefined) todo.dueDate = input.dueDate ?? undefined;
  // Recurring tasks are due every cycle; a fixed date would only mislead.
  if (todo.recurrenceType !== "none") todo.dueDate = undefined;

  await applyTaskFields(todo, input, userId, timeZone);
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

  if (!isRecurring) return toggleTask(todo, timeZone, now);

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
 * Completes or reopens a task. A repeating task isn't closed: a done copy
 * goes to the Logbook and the task moves on to its next day (its deadline
 * shifts by as much), with the checklist unticked.
 */
const toggleTask = async (todo: TodoDoc, timeZone: string, now: Date): Promise<TodoView> => {
  if (todo.completed) {
    todo.completed = false;
    todo.completedAt = null;
    todo.lastCompletedAt = undefined;
    syncReminder(todo);
    await todo.save();
    return viewOf(todo, timeZone, now);
  }

  if (todo.interactionType === "timer") {
    todo.timerElapsedMs = 0;
    todo.timerStartedAt = undefined;
    todo.timerUpdatedAt = now;
  }

  if (!todo.repeat) {
    todo.completed = true;
    todo.completedAt = now;
    todo.lastCompletedAt = now;
    syncReminder(todo);
    await todo.save();
    return viewOf(todo, timeZone, now);
  }

  const today = localDateKey(now, timeZone);
  const { _id: _ignored, createdAt: _created, updatedAt: _updated, ...rest } = todo.toObject({
    versionKey: false,
  }) as ITodo & { _id: unknown; createdAt?: Date; updatedAt?: Date };
  await Todo.create({
    ...rest,
    completed: true,
    completedAt: now,
    lastCompletedAt: now,
    repeat: null,
    repeatOf: todo._id,
    reminderAt: null,
    when: isDay(todo.when) ? todo.when : today,
  });

  const planned = isDay(todo.when) ? (todo.when as string) : null;
  const next = advanceRepeat(todo.repeat, planned, today);
  if (todo.dueDate && DAY_PATTERN.test(todo.dueDate)) {
    todo.dueDate = addDays(todo.dueDate, daysBetween(planned ?? today, next));
  }
  todo.when = next;
  todo.completionCount += 1;
  todo.lastCompletedAt = now;
  todo.checklist.forEach((item) => {
    item.done = false;
  });
  syncReminder(todo);
  await todo.save();
  return viewOf(todo, timeZone, now);
};

const HABIT_TO_UNIT = { daily: "day", weekly: "week", monthly: "month" } as const;
const UNIT_TO_HABIT = { day: "daily", week: "weekly", month: "monthly", year: "monthly" } as const;

/**
 * Turns a habit into a repeating task or back. The completion history is
 * kept either way, so switching back restores the streak.
 */
export const convertTodo = async (
  id: string,
  userId: string,
  to: "habit" | "task",
  timeZone: string,
): Promise<TodoView> => {
  const todo = await findOwned(id, userId);
  const now = new Date();
  const today = localDateKey(now, timeZone);

  if (to === "task" && todo.recurrenceType !== "none") {
    const rule: RepeatRule = {
      every: 1,
      unit: HABIT_TO_UNIT[todo.recurrenceType],
      weekdays: [],
      mode: "fixed",
    };
    const doneThisCycle = isCurrentlyComplete(todo, timeZone, now);
    if (todo.timerStartedAt) stopTimer(todo, timeZone, now);
    todo.recurrenceType = "none";
    todo.repeat = rule;
    todo.when = doneThisCycle ? advanceRepeat(rule, today, today) : today;
    todo.completed = false;
    todo.completedAt = null;
    todo.paused = false;
    todo.pausedAt = undefined;
  } else if (to === "habit" && todo.recurrenceType === "none") {
    todo.recurrenceType = todo.repeat ? UNIT_TO_HABIT[todo.repeat.unit] : "daily";
    todo.repeat = null;
    todo.when = null;
    todo.time = null;
    todo.evening = false;
    todo.dueDate = undefined;
    todo.completed = false;
    todo.completedAt = null;
  }
  syncReminder(todo);
  await todo.save();
  return viewOf(todo, timeZone, now);
};

/** Done tasks, newest first, `limit` at a time before `before`; plus done projects in the same window. */
export const listLogbook = async (
  userId: string,
  opts: { before?: Date; limit: number; timeZone: string },
) => {
  const window = opts.before ? { $lt: opts.before } : { $ne: null };
  const [tasks, projects] = await Promise.all([
    Todo.find({ userId, recurrenceType: "none", completedAt: window })
      .sort({ completedAt: -1 })
      .limit(opts.limit),
    TodoProject.find({ userId, completedAt: window }).sort({ completedAt: -1 }).limit(opts.limit).lean(),
  ]);
  const now = new Date();
  return {
    tasks: tasks.map((todo) => toView(todo, opts.timeZone, now)),
    projects: projects.map((project) => ({ ...project, _id: String(project._id) })),
  };
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

/**
 * Completion days of every habit over the last `days`, in the caller's zone:
 * per-habit dots and the overall heatmap on the Habits page, in one request.
 */
export const getHabitCompletions = async (
  userId: string,
  days: number,
  timeZone: string,
): Promise<{ habits: Array<{ todoId: string; days: string[] }>; totals: Array<{ date: string; count: number }> }> => {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await TodoHistory.find({ userId, completedAt: { $gte: since } }, { todoId: 1, completedAt: 1 }).lean();
  const perHabit = new Map<string, Set<string>>();
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = localDateKey(row.completedAt, timeZone);
    const id = String(row.todoId);
    if (!perHabit.has(id)) perHabit.set(id, new Set());
    perHabit.get(id)?.add(key);
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  return {
    habits: [...perHabit].map(([todoId, set]) => ({ todoId, days: [...set].sort() })),
    totals: [...totals].map(([date, count]) => ({ date, count })),
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
