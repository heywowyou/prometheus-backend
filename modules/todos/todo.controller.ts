import { getUserId } from "../../core/auth";
import {
  asRequiredString,
  asString,
  asNumber,
  asEnum,
  asyncHandler,
  getRequestTimeZone,
  supplied,
} from "../../core/http";
import { BadRequestError } from "../../core/errors/AppError";
import { RECURRENCE_TYPES } from "../../core/domain";
import { DUE_DATE_PATTERN, INTERACTION_TYPES, MAX_DURATION_GOAL } from "./todo.model";
import * as TodoService from "./todo.service";

const parseTodoFields = (body: unknown) => {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    recurrenceType: asEnum(b.recurrenceType, "recurrenceType", RECURRENCE_TYPES),
    interactionType: asEnum(b.interactionType, "interactionType", INTERACTION_TYPES),
    durationGoal: asNumber(b.durationGoal, "durationGoal", {
      min: 0,
      max: MAX_DURATION_GOAL,
      integer: true,
    }),
  };
};

/** `YYYY-MM-DD`, or null to clear; undefined when absent. */
const parseDueDate = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const day = asString(value, "dueDate");
  if (!day || !DUE_DATE_PATTERN.test(day)) {
    throw new BadRequestError("dueDate must be YYYY-MM-DD");
  }
  return day;
};

export const listTodos = asyncHandler(async (req, res) => {
  const todos = await TodoService.listTodos(getUserId(req), {
    paused: req.query.paused === "true",
    timeZone: getRequestTimeZone(req),
  });
  res.status(200).json(todos);
});

export const createTodo = asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const todo = await TodoService.createTodo(
    {
      text: asRequiredString(b.text, "text", { maxLength: 500 }),
      ...parseTodoFields(b),
      dueDate: parseDueDate(b.dueDate) ?? undefined,
    },
    getUserId(req),
    getRequestTimeZone(req),
  );
  res.status(201).json(todo);
});

export const updateTodo = asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const todo = await TodoService.updateTodo(
    String(req.params.id),
    getUserId(req),
    {
      text: asString(b.text, "text", { maxLength: 500 }) || undefined,
      ...parseTodoFields(b),
      ...(supplied(b, "dueDate") ? { dueDate: parseDueDate(b.dueDate) ?? null } : {}),
    },
    getRequestTimeZone(req),
  );
  res.status(200).json(todo);
});

export const toggleTodo = asyncHandler(async (req, res) => {
  const todo = await TodoService.toggleTodo(
    String(req.params.id),
    getUserId(req),
    getRequestTimeZone(req),
  );
  res.status(200).json(todo);
});

export const updateTimer = asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const action = asEnum(b.action, "action", TodoService.TIMER_ACTIONS);
  if (!action) throw new BadRequestError("action is required");

  const todo = await TodoService.updateTimer(
    String(req.params.id),
    getUserId(req),
    action,
    getRequestTimeZone(req),
  );
  res.status(200).json(todo);
});

export const getTodoHistory = asyncHandler(async (req, res) => {
  const days =
    asNumber(req.query.days, "days", { min: 7, max: 730, integer: true }) ?? 182;
  const history = await TodoService.getTodoHistory(
    String(req.params.id),
    getUserId(req),
    days,
    getRequestTimeZone(req),
  );
  res.status(200).json(history);
});

export const pauseTodo = asyncHandler(async (req, res) => {
  const todo = await TodoService.pauseTodo(
    String(req.params.id),
    getUserId(req),
    getRequestTimeZone(req),
  );
  res.status(200).json(todo);
});

export const resumeTodo = asyncHandler(async (req, res) => {
  const todo = await TodoService.resumeTodo(
    String(req.params.id),
    getUserId(req),
    getRequestTimeZone(req),
  );
  res.status(200).json(todo);
});

export const deleteTodo = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  await TodoService.deleteTodo(id, getUserId(req));
  res.status(200).json({ id, message: "Todo successfully deleted" });
});
