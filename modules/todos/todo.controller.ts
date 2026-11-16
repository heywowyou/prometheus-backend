import { getUserId } from "../../core/auth";
import {
  asRequiredString,
  asString,
  asNumber,
  asEnum,
  asBoolean,
  asDate,
  asyncHandler,
  getRequestTimeZone,
  supplied,
} from "../../core/http";
import { DAY_PATTERN, REPEAT_MODES, REPEAT_UNITS, type RepeatRule } from "./repeat";
import * as ListService from "./todo-list.service";
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

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** An id, or null to clear; undefined when absent. */
const parseOptionalId = (b: Record<string, unknown>, key: string): string | null | undefined => {
  if (!supplied(b, key)) return undefined;
  const value = b[key];
  if (value === null || value === "") return null;
  return asRequiredString(value, key, { maxLength: 40 });
};

const parseRepeat = (value: unknown): RepeatRule | null => {
  if (value === null) return null;
  if (typeof value !== "object") throw new BadRequestError("repeat must be an object or null");
  const r = value as Record<string, unknown>;
  const unit = asEnum(r.unit, "repeat.unit", REPEAT_UNITS);
  if (!unit) throw new BadRequestError("repeat.unit is required");
  const weekdays = Array.isArray(r.weekdays)
    ? [...new Set(r.weekdays.map((day) => Number(day)))].filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  return {
    every: asNumber(r.every, "repeat.every", { min: 1, max: 365, integer: true }) ?? 1,
    unit,
    weekdays: unit === "week" ? weekdays : [],
    mode: asEnum(r.mode, "repeat.mode", REPEAT_MODES) ?? "fixed",
  };
};

/** The task-only fields of a create or update body. */
const parseTaskFields = (body: unknown): TodoService.TaskFieldsInput => {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: TodoService.TaskFieldsInput = {};
  if (supplied(b, "notes")) out.notes = asString(b.notes, "notes", { maxLength: 200_000 }) ?? "";
  if (supplied(b, "tags")) {
    if (!Array.isArray(b.tags)) throw new BadRequestError("tags must be an array");
    out.tags = b.tags.map((tag, index) => asRequiredString(tag, `tags[${index}]`, { maxLength: 60 }));
  }
  if (supplied(b, "important")) out.important = asBoolean(b.important, "important") ?? false;
  if (supplied(b, "evening")) out.evening = asBoolean(b.evening, "evening") ?? false;
  if (supplied(b, "checklist")) {
    if (!Array.isArray(b.checklist)) throw new BadRequestError("checklist must be an array");
    out.checklist = b.checklist.map((raw, index) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      return {
        _id: typeof item._id === "string" ? item._id : undefined,
        text: asString(item.text, `checklist[${index}].text`, { maxLength: 500 }) ?? "",
        done: asBoolean(item.done, `checklist[${index}].done`) ?? false,
      };
    });
  }
  const areaId = parseOptionalId(b, "areaId");
  if (areaId !== undefined) out.areaId = areaId;
  const projectId = parseOptionalId(b, "projectId");
  if (projectId !== undefined) out.projectId = projectId;
  const headingId = parseOptionalId(b, "headingId");
  if (headingId !== undefined) out.headingId = headingId;
  if (supplied(b, "when")) {
    const when = b.when;
    if (when === null || when === "") out.when = null;
    else if (when === "someday" || (typeof when === "string" && DAY_PATTERN.test(when))) out.when = when;
    else throw new BadRequestError("when must be YYYY-MM-DD, someday or null");
  }
  if (supplied(b, "time")) {
    const time = b.time;
    if (time === null || time === "") out.time = null;
    else if (typeof time === "string" && TIME_PATTERN.test(time)) out.time = time;
    else throw new BadRequestError("time must be HH:mm or null");
  }
  if (supplied(b, "repeat")) out.repeat = parseRepeat(b.repeat);
  return out;
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
      ...parseTaskFields(b),
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
      ...parseTaskFields(b),
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

export const reorderTodos = asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(b.ids) || b.ids.length === 0 || b.ids.length > 500) {
    throw new BadRequestError("ids must be a non-empty array of up to 500 todo ids");
  }
  const ids = b.ids.map((id, index) => asRequiredString(id, `ids[${index}]`, { maxLength: 40 }));
  if (new Set(ids).size !== ids.length) throw new BadRequestError("ids must be unique");

  await TodoService.reorderTodos(getUserId(req), ids);
  res.status(204).send();
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

export const convertTodo = asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const to = asEnum(b.to, "to", ["habit", "task"] as const);
  if (!to) throw new BadRequestError("to is required");
  const todo = await TodoService.convertTodo(String(req.params.id), getUserId(req), to, getRequestTimeZone(req));
  res.status(200).json(todo);
});

export const listLogbook = asyncHandler(async (req, res) => {
  const logbook = await TodoService.listLogbook(getUserId(req), {
    before: asDate(req.query.before, "before"),
    limit: asNumber(req.query.limit, "limit", { min: 1, max: 200, integer: true }) ?? 60,
    timeZone: getRequestTimeZone(req),
  });
  res.status(200).json(logbook);
});

/* ---- Areas and projects ---- */

const parseProject = (body: unknown): ListService.ProjectInput => {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: ListService.ProjectInput = {};
  if (supplied(b, "title")) out.title = asString(b.title, "title", { maxLength: 200 }) ?? "";
  if (supplied(b, "notes")) out.notes = asString(b.notes, "notes", { maxLength: 200_000 }) ?? "";
  const areaId = parseOptionalId(b, "areaId");
  if (areaId !== undefined) out.areaId = areaId;
  if (supplied(b, "when")) {
    if (b.when === null || b.when === "") out.when = null;
    else if (b.when === "someday" || (typeof b.when === "string" && DAY_PATTERN.test(b.when))) out.when = b.when;
    else throw new BadRequestError("when must be YYYY-MM-DD, someday or null");
  }
  if (supplied(b, "dueDate")) out.dueDate = parseDueDate(b.dueDate) ?? null;
  if (supplied(b, "completed")) out.completed = asBoolean(b.completed, "completed") ?? false;
  if (supplied(b, "headings")) {
    if (!Array.isArray(b.headings)) throw new BadRequestError("headings must be an array");
    out.headings = b.headings.map((raw, index) => {
      const heading = (raw ?? {}) as Record<string, unknown>;
      return {
        _id: typeof heading._id === "string" ? heading._id : undefined,
        title: asString(heading.title, `headings[${index}].title`, { maxLength: 120 }) ?? "",
      };
    });
  }
  return out;
};

export const getLists = asyncHandler(async (req, res) => {
  res.status(200).json(await ListService.getLists(getUserId(req)));
});

export const createArea = asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const title = asString(b.title, "title", { maxLength: 120 }) ?? "";
  res.status(201).json(await ListService.createArea(getUserId(req), title));
});

export const updateArea = asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const title = supplied(b, "title") ? (asString(b.title, "title", { maxLength: 120 }) ?? "") : undefined;
  res.status(200).json(await ListService.updateArea(getUserId(req), String(req.params.id), { title }));
});

export const deleteArea = asyncHandler(async (req, res) => {
  await ListService.deleteArea(getUserId(req), String(req.params.id));
  res.status(204).send();
});

export const createProject = asyncHandler(async (req, res) => {
  res.status(201).json(await ListService.createProject(getUserId(req), parseProject(req.body)));
});

export const updateProject = asyncHandler(async (req, res) => {
  res
    .status(200)
    .json(await ListService.updateProject(getUserId(req), String(req.params.id), parseProject(req.body)));
});

export const deleteProject = asyncHandler(async (req, res) => {
  await ListService.deleteProject(getUserId(req), String(req.params.id));
  res.status(204).send();
});

export const reorderLists = asyncHandler(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const kind = asEnum(b.kind, "kind", ["area", "project"] as const);
  if (!kind) throw new BadRequestError("kind is required");
  if (!Array.isArray(b.ids) || b.ids.length === 0 || b.ids.length > 500) {
    throw new BadRequestError("ids must be a non-empty array of up to 500 ids");
  }
  const ids = b.ids.map((id, index) => asRequiredString(id, `ids[${index}]`, { maxLength: 40 }));
  await ListService.reorderLists(getUserId(req), kind, ids);
  res.status(204).send();
});

export const getHabitCompletions = asyncHandler(async (req, res) => {
  const days = asNumber(req.query.days, "days", { min: 7, max: 400, integer: true }) ?? 182;
  res.status(200).json(await TodoService.getHabitCompletions(getUserId(req), days, getRequestTimeZone(req)));
});
