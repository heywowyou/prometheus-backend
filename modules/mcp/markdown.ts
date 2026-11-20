import MarkdownIt from "markdown-it";
import TurndownService from "turndown";

/**
 * Notes and task notes are stored as Tiptap HTML. Claude reads and writes
 * Markdown, so the MCP tools convert both ways, keeping the editor's own
 * nodes: to-do lists, page links and callouts.
 */

/** Obsidian callout type per callout icon (and per emoji, for older notes); matches the app's export. */
const CALLOUT_TYPES: Record<string, string> = {
  lightbulb: "tip",
  pin: "note",
  "triangle-alert": "warning",
  "circle-check": "success",
  "circle-question-mark": "question",
  flame: "important",
  "💡": "tip",
  "📌": "note",
  "⚠️": "warning",
  "✅": "success",
  "❓": "question",
  "🔥": "important",
};
const CALLOUT_ICONS: Record<string, string> = {
  tip: "lightbulb",
  note: "pin",
  info: "pin",
  warning: "triangle-alert",
  caution: "triangle-alert",
  success: "circle-check",
  question: "circle-question-mark",
  important: "flame",
};

/** The bits of a DOM element the rules read (turndown parses with domino, without DOM typings here). */
interface DomElement {
  nodeName: string;
  innerHTML: string;
  children: ArrayLike<unknown>;
  parentNode: DomElement | null;
  getAttribute(name: string): string | null;
  querySelector(selector: string): DomElement | null;
}
const asElement = (node: unknown) => node as DomElement;

const createTurndown = (): TurndownService => {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    hr: "---",
  });
  // Keep [[page links]] and [ ] readable: square brackets in text stay unescaped.
  const escape = service.escape.bind(service);
  service.escape = (text: string) => escape(text).replace(/\\([[\]])/g, "$1");

  service.addRule("listItem", {
    filter: "li",
    replacement: (content, node, options) => {
      const element = asElement(node);
      const parent = element.parentNode;
      const ordered = parent?.nodeName === "OL";
      const index = ordered
        ? Number(parent?.getAttribute("start") ?? 1) +
          Array.prototype.indexOf.call(parent?.children ?? [], node)
        : 0;
      const task = parent?.getAttribute("data-type") === "taskList";
      const checkbox = element.getAttribute("data-checked") === "true" ? "[x] " : "[ ] ";
      const prefix = ordered ? `${index}. ` : `${options.bulletListMarker} ${task ? checkbox : ""}`;
      const body = content
        .replace(/^\n+/, "")
        .replace(/\s+$/, "")
        .replace(/\n/g, `\n${" ".repeat(prefix.length)}`);
      return `${prefix}${body}\n`;
    },
  });
  // The checkbox the editor renders inside each to-do item.
  service.addRule("taskCheckbox", {
    filter: (node) => node.nodeName === "LABEL" && node.parentElement?.getAttribute("data-type") === "taskItem",
    replacement: () => "",
  });
  service.addRule("highlight", { filter: "mark", replacement: (content) => `==${content}==` });
  service.addRule("underline", { filter: "u", replacement: (content) => content });
  service.addRule("noteLink", {
    filter: (node) => node.nodeName === "A" && node.hasAttribute("data-note-id"),
    replacement: (content) => `[[${content.trim() || "Untitled"}]]`,
  });
  service.addRule("itemMention", {
    filter: (node) => node.nodeName === "SPAN" && node.hasAttribute("data-mention-kind"),
    replacement: (content) => `@${content.trim()}`,
  });
  service.addRule("callout", {
    filter: (node) => node.nodeName === "DIV" && node.getAttribute("data-type") === "callout",
    replacement: (_content, node) => {
      const element = asElement(node);
      const icon = element.getAttribute("data-icon") ?? element.getAttribute("data-emoji") ?? "";
      const type = CALLOUT_TYPES[icon] ?? "note";
      const inner = element.querySelector(".callout-content")?.innerHTML ?? element.innerHTML;
      const body = service.turndown(inner).trim().replace(/\n/g, "\n> ");
      return `\n\n> [!${type}]\n> ${body}\n\n`;
    },
  });
  return service;
};

let turndown: TurndownService | null = null;

/** Tiptap HTML to Markdown. */
export const htmlToMarkdown = (html: string): string => {
  if (!html.trim()) return "";
  turndown ??= createTurndown();
  return turndown.turndown(html).trim();
};

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: false });

/** A note title that a `[[link]]` names, resolved to the note's id; null when there is none. */
export type ResolveNoteLink = (title: string) => string | null;

/**
 * Markdown to Tiptap HTML. `- [ ]` / `- [x]` lists become to-do lists,
 * `[[Title]]` becomes a page link when `resolveLink` finds the page,
 * `> [!tip]` becomes a callout and `==text==` a highlight.
 */
export const markdownToHtml = (source: string, resolveLink: ResolveNoteLink = () => null): string => {
  if (!source.trim()) return "";
  // The editor ignores the newlines markdown-it puts between tags; dropping
  // them first keeps the patterns below simple.
  let html = markdown
    .render(source.replace(/\r\n?/g, "\n"))
    .trim()
    .replace(/>\n+</g, "><");

  // To-do lists: runs of items starting with [ ] or [x] become a to-do list,
  // the other items of the same list stay a bullet list around them. Only
  // flat lists are handled (a nested list makes the item match lazily wrong).
  html = html.replace(/<ul>((?:<li>(?:(?!<ul>|<ol>)[\s\S])*?<\/li>)+)<\/ul>/g, (list, items: string) => {
    const entries = items.match(/<li>[\s\S]*?<\/li>/g) ?? [];
    const isTask = (item: string) => /^<li>(?:<p>)?\[( |x|X)\]\s/.test(item);
    if (!entries.some(isTask)) return list;
    const groups: Array<{ task: boolean; items: string[] }> = [];
    for (const item of entries) {
      const task = isTask(item);
      const last = groups[groups.length - 1];
      if (last && last.task === task) last.items.push(item);
      else groups.push({ task, items: [item] });
    }
    return groups
      .map((group) => {
        if (!group.task) return `<ul>${group.items.join("")}</ul>`;
        const converted = group.items.map((item) => {
          const checked = /^<li>(?:<p>)?\[(x|X)\]/.test(item);
          let body = item
            .replace(/^<li>(<p>)?\[( |x|X)\]\s*/, (_m, p: string | undefined) => (p ? "<p>" : ""))
            .replace(/<\/li>$/, "");
          if (!body.startsWith("<p>")) body = `<p>${body}</p>`;
          return `<li data-type="taskItem" data-checked="${checked}">${body}</li>`;
        });
        return `<ul data-type="taskList">${converted.join("")}</ul>`;
      })
      .join("");
  });

  // Callouts: a quote whose first line is [!type].
  html = html.replace(
    /<blockquote><p>\[!([a-z]+)\]\s*(?:<br>)?([\s\S]*?)<\/blockquote>/gi,
    (_m, type: string, rest: string) => {
      const icon = CALLOUT_ICONS[type.toLowerCase()] ?? "pin";
      const body = rest.trim().startsWith("</p>") ? rest.trim().slice(4) : `<p>${rest.trim()}`;
      return `<div data-type="callout" class="callout" data-icon="${icon}"><div class="callout-content">${body.trim()}</div></div>`;
    },
  );

  html = html.replace(/==([^=\n]+)==/g, "<mark>$1</mark>");

  html = html.replace(/\[\[([^\]\n]{1,300})\]\]/g, (match, title: string) => {
    const id = resolveLink(title.trim());
    if (!id) return match;
    return `<a class="note-link" data-note-id="${id}" href="/notes/${id}">${title.trim()}</a>`;
  });

  return html;
};
