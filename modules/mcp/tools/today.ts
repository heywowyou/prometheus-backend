import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as CalendarService from "../../calendar/calendar.service";
import { localTimeKey } from "../../../core/domain";
import { run, todayOf, type McpContext } from "../context";
import { habitSummary, sortHabits } from "./habits";
import { occurrenceSummary } from "./calendar";
import { loadListNames, loadTodos, taskLists, taskSummary } from "./tasks";

export const registerTodayTools = (server: McpServer, ctx: McpContext) => {
  server.registerTool(
    "get_today",
    {
      title: "Today at a glance",
      description:
        "Jules's day in Prometheus, like the Today screen: the date and time, today's tasks (This Evening apart, overdue deadlines included), habits for the current cycles and today's events. A good first call for anything about today.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    run(async () => {
      const today = todayOf(ctx);
      const [todos, names, events] = await Promise.all([
        loadTodos(ctx),
        loadListNames(ctx.userId),
        CalendarService.listOccurrences(ctx.userId, today, today, ctx.timeZone),
      ]);
      const lists = taskLists(todos, names, today);
      const habits = sortHabits(todos.filter((todo) => todo.recurrenceType !== "none"));
      const summary = (todo: (typeof lists.today)[number]) => taskSummary(todo, names, ctx);
      return {
        date: today,
        weekday: new Date(`${today}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }),
        time: localTimeKey(new Date(), ctx.timeZone),
        timeZone: ctx.timeZone,
        tasks: lists.today.filter((todo) => !todo.evening).map(summary),
        thisEvening: lists.today.filter((todo) => todo.evening).map(summary),
        inboxCount: lists.inbox.filter((todo) => !todo.completed).length,
        habits: habits.map(habitSummary),
        events: events.map((event) => occurrenceSummary(event, ctx)),
      };
    }),
  );
};
