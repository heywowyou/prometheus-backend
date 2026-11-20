import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "./context";
import { registerTodayTools } from "./tools/today";
import { registerTaskTools } from "./tools/tasks";
import { registerHabitTools } from "./tools/habits";
import { registerNoteTools } from "./tools/notes";
import { registerCalendarTools } from "./tools/calendar";
import { registerMediaTools } from "./tools/media";

const INSTRUCTIONS = `Prometheus is Jules's personal everything app: tasks (Things 3 style, with areas, projects, headings, This Evening, Someday and repeats), habits, notes with a daily journal, a calendar, and a media log of movies, shows, books, albums and games.

- Dates are YYYY-MM-DD and times are local to Jules (the zone is in get_today and list_events). Day fields also accept today, tomorrow and yesterday.
- Habits are gentle on purpose: there are no streaks, and resting (skip_habit) is not failing. Don't frame missed days as failures.
- Notes and task notes are Markdown here; [[Page title]] links to another page.
- Ids come from earlier results. Look things up before changing them, and confirm with Jules before deleting anything.`;

/**
 * A fresh server per request: the transport is stateless and every tool is
 * bound to the user the request's token belongs to.
 */
export const createMcpServer = (ctx: McpContext): McpServer => {
  const server = new McpServer(
    { name: "prometheus", title: "Prometheus", version: "1.0.0" },
    { instructions: INSTRUCTIONS, capabilities: { tools: {} } },
  );
  registerTodayTools(server, ctx);
  registerTaskTools(server, ctx);
  registerHabitTools(server, ctx);
  registerNoteTools(server, ctx);
  registerCalendarTools(server, ctx);
  registerMediaTools(server, ctx);
  return server;
};
