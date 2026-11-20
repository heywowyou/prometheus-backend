import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Todo from "../../todos/todo.model";
import * as TodoService from "../../todos/todo.service";
import { BadRequestError, NotFoundError } from "../../../core/errors/AppError";
import { compact, idSchema, run, type McpContext } from "../context";

type View = TodoService.TodoView;

const SECTION = { daily: 0, weekly: 1, monthly: 2, none: 3 } as const;

/**
 * A habit as Claude sees it. No streaks: Jules builds habits without
 * strictness, so only the current cycle matters (done, resting, or open).
 */
export const habitSummary = (habit: View) =>
  compact({
    id: habit._id,
    name: habit.text,
    resets: habit.recurrenceType,
    status: habit.paused ? "paused" : habit.completed ? "done" : habit.skipped ? "resting" : "open",
    target: habit.perWeek ? `${habit.perWeek} days a week` : undefined,
    thisWeek: habit.perWeek ? `${habit.thisWeek ?? 0} of ${habit.perWeek}` : undefined,
    timerMinutes: habit.interactionType === "timer" ? habit.durationGoal : undefined,
    timerRunning: habit.timer?.startedAt ? true : undefined,
    icon: habit.icon,
  });

export const sortHabits = (habits: View[]) =>
  [...habits].sort(
    (a, b) =>
      SECTION[a.recurrenceType] - SECTION[b.recurrenceType] ||
      (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
      a.text.localeCompare(b.text),
  );

const findHabit = async (id: string, ctx: McpContext) => {
  const todo = await Todo.findOne({ _id: id, userId: ctx.userId });
  if (!todo) throw new NotFoundError("Habit");
  if (todo.recurrenceType === "none") throw new BadRequestError("This is a task, not a habit; use the task tools");
  return todo;
};

const viewOf = async (id: string, ctx: McpContext): Promise<View> => {
  const all = await TodoService.listTodos(ctx.userId, { timeZone: ctx.timeZone });
  const found = all.find((todo) => todo._id === id);
  if (found) return found;
  const paused = await TodoService.listTodos(ctx.userId, { paused: true, timeZone: ctx.timeZone });
  const pausedHabit = paused.find((todo) => todo._id === id);
  if (!pausedHabit) throw new NotFoundError("Habit");
  return pausedHabit;
};

const habitFields = {
  resets: z.enum(["daily", "weekly", "monthly"]).optional().describe("How often it resets"),
  perWeek: z
    .number()
    .int()
    .min(1)
    .max(6)
    .nullable()
    .optional()
    .describe("Daily habits only: aim for N days a week; null = every day"),
  timerMinutes: z
    .number()
    .int()
    .min(0)
    .max(1440)
    .nullable()
    .optional()
    .describe("Make it a timed habit of N minutes; 0 or null = a plain checkbox"),
  icon: z
    .string()
    .regex(/^[a-z0-9-]*$/)
    .max(60)
    .optional()
    .describe('A Lucide icon name in kebab case, e.g. "book-open", "dumbbell"; "" for none'),
};

const timerInput = (minutes: number | null | undefined) =>
  minutes === undefined
    ? {}
    : minutes
      ? { interactionType: "timer" as const, durationGoal: minutes }
      : { interactionType: "checkbox" as const, durationGoal: 0 };

export const registerHabitTools = (server: McpServer, ctx: McpContext) => {
  server.registerTool(
    "list_habits",
    {
      title: "List habits",
      description:
        "Habits with where they stand in the current cycle (today, this week or this month): open, done, resting (skipped on purpose) or paused. Missing a day is fine in Prometheus: there are no streaks.",
      inputSchema: { includePaused: z.boolean().default(false) },
      annotations: { readOnlyHint: true },
    },
    run(async ({ includePaused }) => {
      const active = await TodoService.listTodos(ctx.userId, { timeZone: ctx.timeZone });
      const paused = includePaused
        ? await TodoService.listTodos(ctx.userId, { paused: true, timeZone: ctx.timeZone })
        : [];
      const habits = sortHabits([...active, ...paused].filter((todo) => todo.recurrenceType !== "none"));
      return { habits: habits.map(habitSummary) };
    }),
  );

  server.registerTool(
    "create_habit",
    {
      title: "Create a habit",
      description: "Adds a habit that resets daily, weekly or monthly.",
      inputSchema: { name: z.string().min(1).max(500), ...habitFields },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    run(async ({ name, resets, perWeek, timerMinutes, icon }) => {
      const created = await TodoService.createTodo(
        {
          text: name,
          recurrenceType: resets ?? "daily",
          perWeek: perWeek ?? null,
          icon: icon ?? "",
          ...timerInput(timerMinutes),
        },
        ctx.userId,
        ctx.timeZone,
      );
      return habitSummary(await viewOf(created._id, ctx));
    }),
  );

  server.registerTool(
    "update_habit",
    {
      title: "Update a habit",
      description: "Renames a habit, changes how often it resets, its weekly target, timer or icon, or pauses it.",
      inputSchema: {
        id: idSchema,
        name: z.string().min(1).max(500).optional(),
        paused: z.boolean().optional().describe("Paused habits are hidden from Today and Habits until resumed"),
        ...habitFields,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    run(async ({ id, name, paused, resets, perWeek, timerMinutes, icon }) => {
      const habit = await findHabit(id, ctx);
      const input: TodoService.UpdateTodoInput = { ...timerInput(timerMinutes) };
      if (name !== undefined) input.text = name;
      if (resets !== undefined) input.recurrenceType = resets;
      if (perWeek !== undefined) input.perWeek = perWeek;
      if (icon !== undefined) input.icon = icon;
      if (Object.keys(input).length > 0) await TodoService.updateTodo(id, ctx.userId, input, ctx.timeZone);
      if (paused !== undefined && paused !== habit.paused) {
        if (paused) await TodoService.pauseTodo(id, ctx.userId, ctx.timeZone);
        else await TodoService.resumeTodo(id, ctx.userId, ctx.timeZone);
      }
      return habitSummary(await viewOf(id, ctx));
    }),
  );

  server.registerTool(
    "check_habit",
    {
      title: "Tick or untick a habit",
      description:
        "Marks a habit done for the current cycle (or not done, with done: false). Ticking a resting habit completes it. Safe to repeat.",
      inputSchema: { id: idSchema, done: z.boolean().default(true) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    run(async ({ id, done }) => {
      await findHabit(id, ctx);
      const current = await viewOf(id, ctx);
      if (current.paused) throw new BadRequestError("This habit is paused; resume it first");
      if (current.completed !== done) await TodoService.toggleTodo(id, ctx.userId, ctx.timeZone);
      return habitSummary(await viewOf(id, ctx));
    }),
  );

  server.registerTool(
    "skip_habit",
    {
      title: "Rest a habit",
      description:
        "Skips a habit for the current cycle on purpose (a rest day, week or month): it counts as neither done nor missed. skip: false takes the rest back.",
      inputSchema: { id: idSchema, skip: z.boolean().default(true) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    run(async ({ id, skip }) => {
      await findHabit(id, ctx);
      const current = await viewOf(id, ctx);
      if (Boolean(current.skipped) !== skip) await TodoService.toggleSkip(id, ctx.userId, ctx.timeZone);
      return habitSummary(await viewOf(id, ctx));
    }),
  );

  server.registerTool(
    "delete_habit",
    {
      title: "Delete a habit",
      description: "Deletes a habit and its history, for good. Pausing (update_habit) keeps it instead.",
      inputSchema: { id: idSchema },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    run(async ({ id }) => {
      const habit = await findHabit(id, ctx);
      await TodoService.deleteTodo(id, ctx.userId);
      return { deleted: id, name: habit.text };
    }),
  );
};
