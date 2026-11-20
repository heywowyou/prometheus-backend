import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Todo from "../../todos/todo.model";
import { TodoArea, TodoProject } from "../../todos/todo-list.model";
import * as TodoService from "../../todos/todo.service";
import * as ListService from "../../todos/todo-list.service";
import type { RepeatRule } from "../../todos/repeat";
import { htmlToText } from "../../notes/note.text";
import { BadRequestError, NotFoundError } from "../../../core/errors/AppError";
import {
  compact,
  describeRepeat,
  idSchema,
  localDay,
  resolveDay,
  run,
  todayOf,
  weekdayIndexes,
  weekdaySchema,
  type McpContext,
} from "../context";
import { htmlToMarkdown } from "../markdown";
import { toEditorHtml } from "../links";

/* ---------- lists (areas and projects) ---------- */

interface ListNames {
  areas: Map<string, string>;
  projects: Map<string, { title: string; areaId: string | null; when: string | null; headings: Map<string, string> }>;
}

const loadListNames = async (userId: string): Promise<ListNames> => {
  const [areas, projects] = await Promise.all([
    TodoArea.find({ userId }, { title: 1 }).lean(),
    TodoProject.find({ userId }, { title: 1, areaId: 1, when: 1, headings: 1 }).lean(),
  ]);
  return {
    areas: new Map(areas.map((area) => [String(area._id), area.title])),
    projects: new Map(
      projects.map((project) => [
        String(project._id),
        {
          title: project.title,
          areaId: project.areaId ? String(project.areaId) : null,
          when: project.when ?? null,
          headings: new Map((project.headings ?? []).map((h) => [String(h._id), h.title])),
        },
      ]),
    ),
  };
};

/** An area or project named by id or by title (case-insensitive, open projects first). */
const resolveList = async (
  kind: "area" | "project",
  value: string,
  userId: string,
): Promise<string> => {
  const text = value.trim();
  if (/^[a-f0-9]{24}$/i.test(text)) return text;
  const pattern = new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  const found =
    kind === "area"
      ? await TodoArea.findOne({ userId, title: pattern }).lean()
      : await TodoProject.findOne({ userId, title: pattern }).sort({ completedAt: 1 }).lean();
  if (!found) throw new NotFoundError(`${kind === "area" ? "Area" : "Project"} "${text}"`);
  return String(found._id);
};

/* ---------- task views ---------- */

type View = TodoService.TodoView;

const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export const taskSummary = (todo: View, names: ListNames, ctx: McpContext) => {
  const projectId = todo.projectId ? String(todo.projectId) : null;
  const areaId = todo.areaId ? String(todo.areaId) : null;
  const project = projectId ? names.projects.get(projectId) : undefined;
  const checklist = todo.checklist ?? [];
  const notesText = todo.notes ? htmlToText(todo.notes) : "";
  return compact({
    id: todo._id,
    title: todo.text,
    done: todo.completed,
    completedOn: todo.completedAt ? localDay(todo.completedAt, ctx) : undefined,
    when: todo.when ?? undefined,
    evening: todo.evening,
    time: todo.time ?? undefined,
    deadline: todo.dueDate,
    important: todo.important,
    tags: todo.tags,
    project: project?.title,
    projectId: projectId ?? undefined,
    heading: todo.headingId && project ? project.headings.get(String(todo.headingId)) : undefined,
    area: areaId ? names.areas.get(areaId) : project?.areaId ? names.areas.get(project.areaId) : undefined,
    repeat: describeRepeat(todo.repeat ?? null),
    checklist: checklist.length
      ? `${checklist.filter((item) => item.done).length}/${checklist.length} done`
      : undefined,
    notes: notesText ? (notesText.length > 140 ? `${notesText.slice(0, 140)}…` : notesText) : undefined,
    timerMinutes: todo.interactionType === "timer" ? todo.durationGoal : undefined,
  });
};

const isSomedayIn = (names: ListNames) => (todo: View) =>
  todo.when === "someday" ||
  (Boolean(todo.projectId) && names.projects.get(String(todo.projectId))?.when === "someday");

/** Open tasks (and those done today), by the app's own lists. */
export const taskLists = (todos: View[], names: ListNames, today: string) => {
  const tasks = todos
    .filter((todo) => todo.recurrenceType === "none")
    .sort(
      (a, b) =>
        (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  const someday = isSomedayIn(names);
  const inAList = (todo: View) => Boolean(todo.projectId || todo.areaId);
  const startsBy = (todo: View, day: string) => isDay(todo.when) && todo.when <= day;
  const dueBy = (todo: View, day: string) => isDay(todo.dueDate) && todo.dueDate <= day;
  const isToday = (todo: View) => !someday(todo) && (startsBy(todo, today) || dueBy(todo, today));

  return {
    all: tasks,
    inbox: tasks.filter((todo) => !inAList(todo) && !todo.when && !dueBy(todo, today)),
    today: tasks.filter(isToday),
    upcoming: tasks
      .filter((todo) => !todo.completed && !someday(todo) && !isToday(todo))
      .filter((todo) => {
        const day = isDay(todo.when) ? todo.when : isDay(todo.dueDate) ? todo.dueDate : null;
        return day !== null && day > today;
      })
      .sort((a, b) => {
        const dayOf = (todo: View) => (isDay(todo.when) ? todo.when : (todo.dueDate as string));
        return dayOf(a).localeCompare(dayOf(b));
      }),
    anytime: tasks.filter(
      (todo) => !someday(todo) && (!isDay(todo.when) || todo.when <= today) && (inAList(todo) || isToday(todo)),
    ),
    someday: tasks.filter(someday),
    repeating: tasks.filter((todo) => todo.repeat && !todo.completed),
  };
};

const loadTodos = (ctx: McpContext) => TodoService.listTodos(ctx.userId, { timeZone: ctx.timeZone });

const findTask = async (id: string, ctx: McpContext) => {
  const todo = await Todo.findOne({ _id: id, userId: ctx.userId });
  if (!todo) throw new NotFoundError("Task");
  return todo;
};

/* ---------- inputs ---------- */

const repeatSchema = z
  .object({
    every: z.number().int().min(1).max(365).default(1).describe("Every N units"),
    unit: z.enum(["day", "week", "month", "year"]),
    weekdays: z.array(weekdaySchema).optional().describe("Weekly only: which days, e.g. [\"mon\", \"thu\"]"),
    monthDay: z
      .number()
      .int()
      .min(-1)
      .max(31)
      .optional()
      .describe("Monthly only: day of the month (1-31), or -1 for the last day"),
    afterCompletion: z
      .boolean()
      .optional()
      .describe("Count the next time from when it's done instead of on a fixed schedule"),
  })
  .describe("How the task repeats. Completing it logs a done copy and moves it to its next day.");

const toRepeatRule = (input: z.infer<typeof repeatSchema>): RepeatRule => {
  if (input.monthDay === 0) throw new BadRequestError("repeat.monthDay must be 1-31 or -1");
  return {
    every: input.every,
    unit: input.unit,
    weekdays: input.unit === "week" ? weekdayIndexes(input.weekdays) : [],
    mode: input.afterCompletion ? "afterCompletion" : "fixed",
    monthDay: input.unit === "month" ? (input.monthDay ?? null) : null,
  };
};

const checklistSchema = z
  .array(z.object({ text: z.string().max(500), done: z.boolean().optional() }))
  .max(200);

const taskFields = {
  notes: z.string().max(100_000).optional().describe("Markdown. [[Page title]] links to a note."),
  when: z
    .string()
    .nullable()
    .optional()
    .describe("Start day: YYYY-MM-DD, today, tomorrow, or someday. null = no date (Inbox, or Anytime inside a project or area)."),
  evening: z.boolean().optional().describe("Put it under This Evening on its day"),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional()
    .describe("HH:mm on the start day; a reminder fires then"),
  deadline: z.string().nullable().optional().describe("Deadline YYYY-MM-DD (or today / tomorrow)"),
  repeat: repeatSchema.nullable().optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  important: z.boolean().optional(),
  project: z.string().nullable().optional().describe("Project id or exact title"),
  area: z.string().nullable().optional().describe("Area id or exact title (ignored when a project is set)"),
  heading: z.string().nullable().optional().describe("Heading id or title inside the project"),
  checklist: checklistSchema.optional().describe("Replaces the whole checklist"),
};

type TaskFieldArgs = {
  [K in keyof typeof taskFields]?: z.infer<(typeof taskFields)[K]>;
};

const toTaskInput = async (args: TaskFieldArgs, ctx: McpContext): Promise<TodoService.UpdateTodoInput> => {
  const input: TodoService.UpdateTodoInput = {};
  if (args.notes !== undefined) input.notes = await toEditorHtml(ctx.userId, args.notes);
  if (args.when !== undefined) {
    input.when =
      args.when === null || args.when === ""
        ? null
        : args.when.trim().toLowerCase() === "someday"
          ? "someday"
          : resolveDay(args.when, ctx, "when");
  }
  if (args.evening !== undefined) input.evening = args.evening;
  if (args.time !== undefined) input.time = args.time;
  if (args.deadline !== undefined) {
    input.dueDate = args.deadline ? resolveDay(args.deadline, ctx, "deadline") : null;
  }
  if (args.repeat !== undefined) input.repeat = args.repeat ? toRepeatRule(args.repeat) : null;
  if (args.tags !== undefined) input.tags = args.tags;
  if (args.important !== undefined) input.important = args.important;
  if (args.project !== undefined) {
    input.projectId = args.project ? await resolveList("project", args.project, ctx.userId) : null;
  }
  if (args.area !== undefined && !args.project) {
    input.areaId = args.area ? await resolveList("area", args.area, ctx.userId) : null;
  }
  if (args.checklist !== undefined) {
    input.checklist = args.checklist.map((item) => ({ text: item.text, done: item.done ?? false }));
  }
  return input;
};

/** A heading named by id or title, within the task's (possibly new) project. */
const resolveHeading = async (heading: string, projectId: string | null, userId: string) => {
  if (/^[a-f0-9]{24}$/i.test(heading)) return heading;
  if (!projectId) throw new BadRequestError("heading needs the task to be in a project");
  const project = await TodoProject.findOne({ _id: projectId, userId }).lean();
  const match = project?.headings.find((h) => h.title.trim().toLowerCase() === heading.trim().toLowerCase());
  if (!match) throw new NotFoundError(`Heading "${heading}"`);
  return String(match._id);
};

const taskDetail = async (id: string, ctx: McpContext) => {
  const todo = await findTask(id, ctx);
  if (todo.recurrenceType !== "none") throw new BadRequestError("This is a habit; use the habit tools");
  const view = TodoService.toView(todo, ctx.timeZone);
  const names = await loadListNames(ctx.userId);
  return {
    ...taskSummary(view, names, ctx),
    notes: todo.notes ? htmlToMarkdown(todo.notes) : undefined,
    checklist: todo.checklist?.length
      ? todo.checklist.map((item) => compact({ text: item.text, done: item.done }))
      : undefined,
    created: localDay(todo.get("createdAt") as Date, ctx),
  };
};

/* ---------- tools ---------- */

const LISTS = ["inbox", "today", "upcoming", "anytime", "someday", "repeating", "completed", "all"] as const;

export const registerTaskTools = (server: McpServer, ctx: McpContext) => {
  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description:
        "Lists to-do tasks the way the Prometheus Tasks app does (Things 3 style). Lists: inbox (no date, no project), today (started or due by today, includes This Evening), upcoming (future start or deadline), anytime (startable now), someday, repeating, completed (most recent first), all (every open task). Filter by project, area, tag or text. Habits are separate (list_habits).",
      inputSchema: {
        list: z.enum(LISTS).default("today"),
        project: z.string().optional().describe("Project id or exact title"),
        area: z.string().optional().describe("Area id or exact title"),
        tag: z.string().optional(),
        query: z.string().optional().describe("Text to find in titles and notes"),
        limit: z.number().int().min(1).max(200).default(50),
      },
      annotations: { readOnlyHint: true },
    },
    run(async ({ list, project, area, tag, query, limit }) => {
      const names = await loadListNames(ctx.userId);
      const today = todayOf(ctx);
      let tasks: View[];
      if (list === "completed") {
        const projectId = project ? await resolveList("project", project, ctx.userId) : undefined;
        const areaId = area && !projectId ? await resolveList("area", area, ctx.userId) : undefined;
        const logbook = await TodoService.listLogbook(ctx.userId, {
          limit: query || tag ? 200 : limit,
          timeZone: ctx.timeZone,
          projectId,
          areaId,
        });
        tasks = logbook.tasks;
      } else {
        const lists = taskLists(await loadTodos(ctx), names, today);
        tasks = list === "all" ? lists.all.filter((todo) => !todo.completed) : lists[list];
        if (project) {
          const projectId = await resolveList("project", project, ctx.userId);
          tasks = tasks.filter((todo) => String(todo.projectId) === projectId);
        }
        if (area) {
          const areaId = await resolveList("area", area, ctx.userId);
          tasks = tasks.filter(
            (todo) =>
              String(todo.areaId) === areaId ||
              (todo.projectId && names.projects.get(String(todo.projectId))?.areaId === areaId),
          );
        }
      }
      if (tag) tasks = tasks.filter((todo) => (todo.tags ?? []).includes(tag.toLowerCase().replace(/^#/, "")));
      if (query) {
        const needle = query.toLowerCase();
        tasks = tasks.filter(
          (todo) =>
            todo.text.toLowerCase().includes(needle) || htmlToText(todo.notes ?? "").toLowerCase().includes(needle),
        );
      }
      return {
        today,
        list,
        count: tasks.length,
        tasks: tasks.slice(0, limit).map((todo) => taskSummary(todo, names, ctx)),
      };
    }),
  );

  server.registerTool(
    "get_task",
    {
      title: "Get a task",
      description: "One task in full: notes as Markdown, checklist items, schedule, project.",
      inputSchema: { id: idSchema },
      annotations: { readOnlyHint: true },
    },
    run(async ({ id }) => taskDetail(id, ctx)),
  );

  server.registerTool(
    "create_task",
    {
      title: "Create a task",
      description:
        "Adds a to-do task. Without when, project or area it lands in the Inbox. A time needs a day (today is assumed). Use list_projects to see projects, areas and headings.",
      inputSchema: {
        title: z.string().min(1).max(500),
        ...taskFields,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    run(async ({ title, heading, ...fields }) => {
      const input = await toTaskInput(fields, ctx);
      if (heading) input.headingId = await resolveHeading(heading, input.projectId ?? null, ctx.userId);
      const created = await TodoService.createTodo(
        { text: title, ...input, dueDate: input.dueDate ?? undefined },
        ctx.userId,
        ctx.timeZone,
      );
      return taskDetail(created._id, ctx);
    }),
  );

  server.registerTool(
    "update_task",
    {
      title: "Update a task",
      description:
        "Changes a task. Only the fields you pass change; null clears a field (when: null moves it out of its day, project: null takes it out of its project). notes and checklist replace the whole value.",
      inputSchema: {
        id: idSchema,
        title: z.string().min(1).max(500).optional(),
        ...taskFields,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    run(async ({ id, title, heading, ...fields }) => {
      const todo = await findTask(id, ctx);
      if (todo.recurrenceType !== "none") throw new BadRequestError("This is a habit; use update_habit");
      const input = await toTaskInput(fields, ctx);
      if (title !== undefined) input.text = title;
      if (heading !== undefined) {
        const projectId =
          input.projectId !== undefined ? input.projectId : todo.projectId ? String(todo.projectId) : null;
        input.headingId = heading ? await resolveHeading(heading, projectId, ctx.userId) : null;
      }
      await TodoService.updateTodo(id, ctx.userId, input, ctx.timeZone);
      return taskDetail(id, ctx);
    }),
  );

  server.registerTool(
    "complete_task",
    {
      title: "Complete or reopen a task",
      description:
        "Marks a task done (or, with done: false, not done). A repeating task logs a done copy and moves to its next day. Safe to repeat: a task already in the asked state is left alone.",
      inputSchema: { id: idSchema, done: z.boolean().default(true) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    run(async ({ id, done }) => {
      const todo = await findTask(id, ctx);
      if (todo.recurrenceType !== "none") throw new BadRequestError("This is a habit; use check_habit");
      const current = TodoService.toView(todo, ctx.timeZone);
      if (current.completed !== done) await TodoService.toggleTodo(id, ctx.userId, ctx.timeZone);
      const result = await taskDetail(id, ctx);
      return todo.repeat && done
        ? { ...result, note: `Logged as done; the task now starts on ${result.when ?? "its next day"}.` }
        : result;
    }),
  );

  server.registerTool(
    "delete_task",
    {
      title: "Delete a task",
      description: "Deletes a task for good (there is no trash for tasks).",
      inputSchema: { id: idSchema },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    run(async ({ id }) => {
      const todo = await findTask(id, ctx);
      if (todo.recurrenceType !== "none") throw new BadRequestError("This is a habit; use delete_habit");
      await TodoService.deleteTodo(id, ctx.userId);
      return { deleted: id, title: todo.text };
    }),
  );

  /* ---- areas and projects ---- */

  server.registerTool(
    "list_projects",
    {
      title: "List areas and projects",
      description: "Areas, and open projects with their headings, schedule, deadline and progress.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    run(async () => {
      const [{ areas, projects }, counts] = await Promise.all([
        ListService.getLists(ctx.userId),
        Todo.aggregate<{ _id: unknown; open: number; done: number }>([
          { $match: { userId: ctx.userId, recurrenceType: "none", projectId: { $ne: null }, repeatOf: null } },
          {
            $group: {
              _id: "$projectId",
              open: { $sum: { $cond: ["$completed", 0, 1] } },
              done: { $sum: { $cond: ["$completed", 1, 0] } },
            },
          },
        ]),
      ]);
      const progress = new Map(counts.map((row) => [String(row._id), row]));
      const areaTitle = new Map(areas.map((area) => [String(area._id), area.title]));
      return {
        areas: areas.map((area) => ({ id: String(area._id), title: area.title })),
        projects: projects.map((project) =>
          compact({
            id: String(project._id),
            title: project.title,
            area: project.areaId ? areaTitle.get(String(project.areaId)) : undefined,
            when: project.when ?? undefined,
            deadline: project.dueDate ?? undefined,
            headings: (project.headings ?? []).map((h) => ({ id: String(h._id), title: h.title })),
            openTasks: progress.get(String(project._id))?.open ?? 0,
            doneTasks: progress.get(String(project._id))?.done ?? 0,
            notes: project.notes ? htmlToMarkdown(project.notes) : undefined,
          }),
        ),
      };
    }),
  );

  const projectFields = {
    notes: z.string().max(100_000).optional().describe("Markdown"),
    area: z.string().nullable().optional().describe("Area id or exact title; null for none"),
    when: z.string().nullable().optional().describe("YYYY-MM-DD, someday (parks it and its tasks), or null for active"),
    deadline: z.string().nullable().optional().describe("YYYY-MM-DD or null"),
    headings: z
      .array(z.string().max(120))
      .max(50)
      .optional()
      .describe("All heading titles, in order. Replaces the list; tasks under a removed heading stay in the project."),
  };

  const toProjectInput = async (
    args: { notes?: string; area?: string | null; when?: string | null; deadline?: string | null; headings?: string[] },
    existing: Array<{ _id: unknown; title: string }> = [],
  ): Promise<ListService.ProjectInput> => {
    const input: ListService.ProjectInput = {};
    if (args.notes !== undefined) input.notes = await toEditorHtml(ctx.userId, args.notes);
    if (args.area !== undefined) input.areaId = args.area ? await resolveList("area", args.area, ctx.userId) : null;
    if (args.when !== undefined) {
      input.when = !args.when ? null : args.when.toLowerCase() === "someday" ? "someday" : resolveDay(args.when, ctx, "when");
    }
    if (args.deadline !== undefined) input.dueDate = args.deadline ? resolveDay(args.deadline, ctx, "deadline") : null;
    if (args.headings !== undefined) {
      // Keep a heading's id when its title stays, so its tasks stay under it.
      const byTitle = new Map(existing.map((h) => [h.title.trim().toLowerCase(), String(h._id)]));
      input.headings = args.headings.map((title) => {
        const id = byTitle.get(title.trim().toLowerCase());
        return id ? { _id: id, title } : { title };
      });
    }
    return input;
  };

  server.registerTool(
    "create_project",
    {
      title: "Create a project",
      description: "Creates a project (an outcome with tasks), optionally inside an area.",
      inputSchema: { title: z.string().min(1).max(200), ...projectFields },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    run(async ({ title, ...fields }) => {
      const { headings, ...rest } = await toProjectInput(fields);
      const created = await ListService.createProject(ctx.userId, { title, ...rest });
      if (headings || rest.when !== undefined || rest.dueDate !== undefined) {
        await ListService.updateProject(ctx.userId, created._id, { headings, when: rest.when, dueDate: rest.dueDate });
      }
      return { id: created._id, title };
    }),
  );

  server.registerTool(
    "update_project",
    {
      title: "Update a project",
      description:
        "Renames, moves, schedules or completes a project. completed: true also completes its open tasks; false reopens the project (its tasks stay done).",
      inputSchema: {
        id: z.string().describe("Project id or exact title"),
        title: z.string().min(1).max(200).optional(),
        completed: z.boolean().optional(),
        ...projectFields,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    run(async ({ id, title, completed, ...fields }) => {
      const projectId = await resolveList("project", id, ctx.userId);
      const project = await TodoProject.findOne({ _id: projectId, userId: ctx.userId }).lean();
      if (!project) throw new NotFoundError("Project");
      const input = await toProjectInput(fields, project.headings ?? []);
      if (title !== undefined) input.title = title;
      if (completed !== undefined) input.completed = completed;
      const updated = await ListService.updateProject(ctx.userId, projectId, input);
      return compact({
        id: updated._id,
        title: updated.title,
        completed: Boolean(updated.completedAt),
        when: updated.when ?? undefined,
        deadline: updated.dueDate ?? undefined,
        headings: (updated.headings ?? []).map((h) => h.title),
      });
    }),
  );

  server.registerTool(
    "delete_project",
    {
      title: "Delete a project",
      description: "Deletes a project AND every task in it, for good. To keep the tasks, move them out first.",
      inputSchema: { id: z.string().describe("Project id or exact title") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    run(async ({ id }) => {
      const projectId = await resolveList("project", id, ctx.userId);
      const tasks = await Todo.countDocuments({ userId: ctx.userId, projectId });
      await ListService.deleteProject(ctx.userId, projectId);
      return { deleted: projectId, tasksDeleted: tasks };
    }),
  );

  server.registerTool(
    "save_area",
    {
      title: "Create or rename an area",
      description: "Creates an area of life (Home, Work…) or, with an id, renames one.",
      inputSchema: { id: idSchema.optional(), title: z.string().min(1).max(120) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    run(async ({ id, title }) => {
      const area = id
        ? await ListService.updateArea(ctx.userId, id, { title })
        : await ListService.createArea(ctx.userId, title);
      return { id: area._id, title: area.title };
    }),
  );

  server.registerTool(
    "delete_area",
    {
      title: "Delete an area",
      description: "Deletes an area. Its projects and tasks are kept, without an area.",
      inputSchema: { id: z.string().describe("Area id or exact title") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    run(async ({ id }) => {
      const areaId = await resolveList("area", id, ctx.userId);
      await ListService.deleteArea(ctx.userId, areaId);
      return { deleted: areaId };
    }),
  );
};

export { loadListNames, loadTodos };
