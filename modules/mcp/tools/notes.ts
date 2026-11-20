import { z } from "zod";
import type { HydratedDocument } from "mongoose";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Note, { type INote } from "../../notes/note.model";
import * as NoteService from "../../notes/note.service";
import { BadRequestError } from "../../../core/errors/AppError";
import { compact, idSchema, localDay, localStamp, resolveDay, run, todayOf, type McpContext } from "../context";
import { htmlToMarkdown } from "../markdown";
import { toEditorHtml } from "../links";

type NoteDoc = HydratedDocument<INote>;

/** "Friday 20 November 2026": the title a journal page gets when Claude opens it first. */
const journalTitle = (day: string): string => {
  const date = new Date(`${day}T12:00:00Z`);
  const part = (options: Intl.DateTimeFormatOptions) =>
    date.toLocaleDateString("en-GB", { ...options, timeZone: "UTC" });
  return `${part({ weekday: "long" })} ${part({ day: "numeric" })} ${part({ month: "long" })} ${part({ year: "numeric" })}`;
};

const titleOf = (note: { title: string; dailyDate?: string }) =>
  note.title.trim() || (note.dailyDate ? journalTitle(note.dailyDate) : "Untitled");

const noteDetail = async (note: NoteDoc, ctx: McpContext, withBacklinks = false) => {
  const [parent, children, backlinks] = await Promise.all([
    note.parentId ? Note.findOne({ _id: note.parentId, userId: ctx.userId }, { title: 1 }).lean() : null,
    Note.find(
      { userId: ctx.userId, parentId: note._id, deletedAt: null, empty: { $ne: true } },
      { title: 1, dailyDate: 1 },
    )
      .sort({ order: 1 })
      .lean(),
    withBacklinks ? NoteService.getBacklinks(String(note._id), ctx.userId) : null,
  ]);
  return compact({
    id: String(note._id),
    title: titleOf(note),
    journalDate: note.dailyDate,
    icon: note.icon,
    tags: note.tags,
    pinned: note.pinned,
    archived: note.archived,
    inTrash: Boolean(note.deletedAt),
    template: note.isTemplate,
    parent: parent ? { id: String(parent._id), title: titleOf(parent) } : undefined,
    subPages: children.map((child) => ({ id: String(child._id), title: titleOf(child) })),
    updated: localStamp(note.updatedAt, ctx),
    created: localDay(note.createdAt, ctx),
    content: htmlToMarkdown(note.content ?? ""),
    linkedFrom: backlinks?.linked.map((entry) => ({ id: entry._id, title: entry.title || "Untitled" })),
    mentionedIn: backlinks?.unlinked.map((entry) => ({ id: entry._id, title: entry.title || "Untitled" })),
  });
};

/** Appends Markdown to a note's body, as a new block at the end. */
const appendTo = async (note: NoteDoc, markdown: string, ctx: McpContext) => {
  const html = await toEditorHtml(ctx.userId, markdown);
  return NoteService.updateNote(String(note._id), ctx.userId, { content: `${note.content ?? ""}${html}` });
};

const openJournal = async (date: string | undefined, ctx: McpContext) => {
  const day = date ? resolveDay(date, ctx) : todayOf(ctx);
  return NoteService.getOrCreateDaily(ctx.userId, day, journalTitle(day));
};

const parentInput = z
  .string()
  .nullable()
  .optional()
  .describe("Id of the page to nest it under; null for the top level");

export const registerNoteTools = (server: McpServer, ctx: McpContext) => {
  server.registerTool(
    "search_notes",
    {
      title: "Search notes",
      description:
        "Finds notes by text in the title or body, or by tag. Without a query, lists the most recently edited notes. Returns short excerpts; use get_note for the full page.",
      inputSchema: {
        query: z.string().optional(),
        tag: z.string().optional(),
        where: z.enum(["active", "archived", "trash"]).default("active"),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true },
    },
    run(async ({ query, tag, where, limit }) => {
      const notes = await NoteService.listNotes(ctx.userId, {
        view: where,
        query,
        tag: tag?.toLowerCase().replace(/^#/, ""),
      });
      return {
        count: notes.length,
        notes: notes.slice(0, limit).map((note) =>
          compact({
            id: note._id,
            title: titleOf(note),
            excerpt: note.excerpt,
            tags: note.tags,
            pinned: note.pinned,
            journalDate: note.dailyDate,
            parentId: note.parentId ?? undefined,
            updated: localStamp(note.updatedAt, ctx),
          }),
        ),
      };
    }),
  );

  server.registerTool(
    "list_pages",
    {
      title: "List the page tree",
      description:
        "The notes sidebar: every page as an indented tree (id, title), favorites marked with *. Journal pages and templates are left out. Useful to find where a new page belongs.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    run(async () => {
      const entries = (await NoteService.getIndex(ctx.userId)).filter(
        (entry) => !entry.dailyDate && !entry.isTemplate && !entry.empty,
      );
      const children = new Map<string | null, typeof entries>();
      const ids = new Set(entries.map((entry) => entry._id));
      for (const entry of entries) {
        const parent = entry.parentId && ids.has(entry.parentId) ? entry.parentId : null;
        children.set(parent, [...(children.get(parent) ?? []), entry]);
      }
      const lines: string[] = [];
      const walk = (parent: string | null, depth: number) => {
        for (const entry of children.get(parent) ?? []) {
          lines.push(`${"  ".repeat(depth)}- ${entry.title.trim() || "Untitled"}${entry.pinned ? " *" : ""} (${entry._id})`);
          walk(entry._id, depth + 1);
        }
      };
      walk(null, 0);
      return lines.length ? lines.join("\n") : "No pages yet.";
    }),
  );

  server.registerTool(
    "get_note",
    {
      title: "Read a note",
      description:
        "One note in full, as Markdown, with its parent, sub-pages and tags. [[Title]] marks a link to another page, @Name a mention of a task or media log.",
      inputSchema: {
        id: idSchema,
        includeBacklinks: z.boolean().default(false).describe("Also list pages that link to or mention this one"),
      },
      annotations: { readOnlyHint: true },
    },
    run(async ({ id, includeBacklinks }) => noteDetail(await NoteService.getNote(id, ctx.userId), ctx, includeBacklinks)),
  );

  server.registerTool(
    "create_note",
    {
      title: "Create a note",
      description:
        "Creates a page in Notes from Markdown. Supports headings, lists, to-do lists (- [ ] item), tables, quotes, code, callouts (> [!tip]) and [[Page title]] links to existing pages.",
      inputSchema: {
        title: z.string().max(300),
        content: z.string().max(500_000).default("").describe("Markdown body"),
        parentId: parentInput,
        tags: z.array(z.string().max(40)).max(20).optional(),
        icon: z.string().regex(/^[a-z0-9-]*$/).max(60).optional().describe("Lucide icon name, e.g. \"book-open\""),
        templateId: idSchema.optional().describe("Start from this template (its body is used when content is empty)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    run(async ({ title, content, parentId, tags, icon, templateId }) => {
      const note = await NoteService.createNote(
        {
          title,
          ...(content.trim() ? { content: await toEditorHtml(ctx.userId, content) } : {}),
          tags,
          icon,
          parentId: parentId ?? null,
          templateId,
        },
        ctx.userId,
      );
      return noteDetail(note, ctx);
    }),
  );

  server.registerTool(
    "update_note",
    {
      title: "Edit a note",
      description:
        "Changes a note. content replaces the whole body (read it first with get_note); append adds Markdown at the end without touching the rest. The previous version is kept in the note's history. archived: true archives the page and its sub-pages.",
      inputSchema: {
        id: idSchema,
        title: z.string().max(300).optional(),
        content: z.string().max(500_000).optional().describe("New full body, Markdown"),
        append: z.string().max(200_000).optional().describe("Markdown to add at the end"),
        tags: z.array(z.string().max(40)).max(20).optional(),
        pinned: z.boolean().optional().describe("Favorite"),
        archived: z.boolean().optional(),
        parentId: parentInput,
        icon: z.string().regex(/^[a-z0-9-]*$/).max(60).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    run(async ({ id, title, content, append, tags, pinned, archived, parentId, icon }) => {
      if (content !== undefined && append !== undefined) {
        throw new BadRequestError("Pass content or append, not both");
      }
      let note = await NoteService.getNote(id, ctx.userId);
      if (note.deletedAt) throw new BadRequestError("This note is in the trash; restore it first");
      const input: NoteService.UpdateNoteInput = { title, tags, pinned, archived, icon };
      if (content !== undefined) input.content = await toEditorHtml(ctx.userId, content);
      if (parentId !== undefined) input.parentId = parentId;
      note = await NoteService.updateNote(id, ctx.userId, input);
      if (append?.trim()) note = await appendTo(note, append, ctx);
      return noteDetail(note, ctx);
    }),
  );

  server.registerTool(
    "get_journal",
    {
      title: "Open a journal page",
      description:
        "The journal (daily note) for a day, created from the daily template if it doesn't exist yet. Defaults to today.",
      inputSchema: { date: z.string().optional().describe("YYYY-MM-DD, today, yesterday…") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    run(async ({ date }) => noteDetail(await openJournal(date, ctx), ctx)),
  );

  server.registerTool(
    "add_to_journal",
    {
      title: "Write in the journal",
      description: "Appends Markdown to the journal page of a day (today by default), creating the page if needed.",
      inputSchema: {
        content: z.string().min(1).max(200_000).describe("Markdown to add at the end"),
        date: z.string().optional().describe("YYYY-MM-DD, today, yesterday…"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    run(async ({ content, date }) => {
      const note = await appendTo(await openJournal(date, ctx), content, ctx);
      return noteDetail(note, ctx);
    }),
  );

  server.registerTool(
    "trash_note",
    {
      title: "Move a note to the trash",
      description: "Moves a note and its sub-pages to the trash. They can be restored for 30 days.",
      inputSchema: { id: idSchema },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    run(async ({ id }) => {
      const note = await NoteService.trashNote(id, ctx.userId);
      return { trashed: id, title: titleOf(note) };
    }),
  );

  server.registerTool(
    "restore_note",
    {
      title: "Restore a note from the trash",
      description: "Brings a trashed note back, with the sub-pages trashed with it.",
      inputSchema: { id: idSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    run(async ({ id }) => noteDetail(await NoteService.restoreNote(id, ctx.userId), ctx)),
  );

  server.registerTool(
    "delete_note_forever",
    {
      title: "Delete a note for good",
      description: "Permanently deletes a note that is already in the trash, with its history. Cannot be undone.",
      inputSchema: { id: idSchema },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    run(async ({ id }) => {
      const note = await NoteService.getNote(id, ctx.userId);
      await NoteService.deleteNote(id, ctx.userId);
      return { deleted: id, title: titleOf(note) };
    }),
  );
};
