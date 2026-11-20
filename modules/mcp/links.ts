import Note from "../notes/note.model";
import { markdownToHtml, type ResolveNoteLink } from "./markdown";

/** Resolves `[[Title]]` to the most recently edited live page with that title (case-insensitive). */
const noteLinkResolver = async (userId: string, markdown: string): Promise<ResolveNoteLink> => {
  if (!markdown.includes("[[")) return () => null;
  const notes = await Note.find(
    { userId, deletedAt: null, isTemplate: { $ne: true } },
    { title: 1 },
  )
    .sort({ updatedAt: -1 })
    .lean();
  const byTitle = new Map<string, string>();
  for (const note of notes) {
    const key = note.title.trim().toLowerCase();
    if (key && !byTitle.has(key)) byTitle.set(key, String(note._id));
  }
  return (title) => byTitle.get(title.toLowerCase()) ?? null;
};

/** Markdown from Claude to the editor's HTML, with page links resolved. */
export const toEditorHtml = async (userId: string, markdown: string): Promise<string> =>
  markdownToHtml(markdown, await noteLinkResolver(userId, markdown));
