import { getUserId } from "../../core/auth";
import {
  asRequiredString,
  asString,
  asNumber,
  asEnum,
  asyncHandler,
  getRequestTimeZone,
} from "../../core/http";
import { RECURRENCE_TYPES } from "../../core/domain";
import { INTERACTION_TYPES } from "./todo.model";
import * as TodoService from "./todo.service";

const parseTodoFields = (body: unknown) => {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    recurrenceType: asEnum(b.recurrenceType, "recurrenceType", RECURRENCE_TYPES),
    interactionType: asEnum(b.interactionType, "interactionType", INTERACTION_TYPES),
    durationGoal: asNumber(b.durationGoal, "durationGoal", { min: 0, integer: true }),
  };
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
