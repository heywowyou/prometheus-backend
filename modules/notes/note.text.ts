const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

const decodeEntity = (match: string, body: string): string => {
  if (body.startsWith("#")) {
    const hex = body[1] === "x" || body[1] === "X";
    const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : match;
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? match;
};

/**
 * Plain text of a note's Tiptap HTML, for search, previews and word counts.
 * Block boundaries become newlines so words from adjacent paragraphs don't
 * run together.
 */
export const htmlToText = (html: string): string =>
  html
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|blockquote|pre|div)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, decodeEntity)
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n[\s]*/g, "\n")
    .trim();

/** A note with no title, no text and no images carries nothing worth keeping. */
export const isEmptyNote = (title: string, content: string, text: string) =>
  title.trim() === "" && text === "" && !/<img\b/i.test(content);

/** First `max` characters of the text on one line, cut at a word boundary. */
export const excerptOf = (text: string, max = 240): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}…`;
};

/** Lower-cased, trimmed, de-duplicated tags, capped in length and number. */
export const normaliseTags = (tags: string[]): string[] => [
  ...new Set(
    tags
      .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "-").replace(/^#/, ""))
      .filter((tag) => tag.length > 0 && tag.length <= 40),
  ),
].slice(0, 20);

/** Escapes user text for use inside a RegExp. */
export const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
