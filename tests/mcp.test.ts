import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToMarkdown, markdownToHtml } from "../modules/mcp/markdown";
import { isAllowed } from "../modules/mcp/allowlist";
import { describeRepeat, resolveDay, resolveInstant } from "../modules/mcp/context";

const ctx = { userId: "user_1", timeZone: "Europe/Paris" };

test("markdown to-do lists become Tiptap task lists, and back", () => {
  const html = markdownToHtml("- [ ] buy milk\n- [x] call mum");
  assert.equal(
    html,
    '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>buy milk</p></li>' +
      '<li data-type="taskItem" data-checked="true"><p>call mum</p></li></ul>',
  );
  assert.equal(htmlToMarkdown(html), "- [ ] buy milk\n- [x] call mum");
});

test("a list mixing to-dos and bullets splits into two lists", () => {
  const html = markdownToHtml("- [ ] todo\n- plain");
  assert.match(html, /^<ul data-type="taskList">.*<\/ul><ul><li>plain<\/li><\/ul>$/);
});

test("[[links]] resolve to known pages and stay as text otherwise", () => {
  const html = markdownToHtml("See [[Trip ideas]] and [[Nowhere]]", (title) =>
    title === "Trip ideas" ? "64a1b2c3d4e5f6a7b8c9d0e1" : null,
  );
  assert.match(html, /<a class="note-link" data-note-id="64a1b2c3d4e5f6a7b8c9d0e1" href="\/notes\/64a1b2c3d4e5f6a7b8c9d0e1">Trip ideas<\/a>/);
  assert.match(html, /\[\[Nowhere\]\]/);
  assert.equal(htmlToMarkdown(html), "See [[Trip ideas]] and [[Nowhere]]");
});

test("callouts round-trip as Obsidian callouts", () => {
  const html = markdownToHtml("> [!tip]\n> Book early");
  assert.equal(
    html,
    '<div data-type="callout" class="callout" data-icon="lightbulb"><div class="callout-content"><p>Book early</p></div></div>',
  );
  assert.equal(htmlToMarkdown(html), "> [!tip]\n> Book early");
});

test("raw HTML in markdown is escaped, not injected", () => {
  assert.equal(markdownToHtml("<script>alert(1)</script>"), "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
});

test("editor checkboxes and mentions read as markdown", () => {
  const md = htmlToMarkdown(
    '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>done</p></div></li></ul>' +
      '<p>Watched <span class="item-mention" data-mention-kind="media" data-mention-id="1">Dune</span></p>',
  );
  assert.equal(md, "- [x] done\n\nWatched @Dune");
});

test("the allowlist matches user ids and verified emails, and is closed when empty", async () => {
  const emails = async () => ["Pro@Example.com"];
  assert.equal(await isAllowed("user_1", [], emails), false);
  assert.equal(await isAllowed("user_ABC", ["user_abc"], emails), true);
  assert.equal(await isAllowed("user_1", ["user_2"], emails), false);
  assert.equal(await isAllowed("user_1", ["pro@example.com"], emails), true);
  assert.equal(await isAllowed("user_1", ["someone@else.com"], emails), false);
});

test("days and local times resolve in the user's zone", () => {
  assert.equal(resolveDay("2026-03-29", ctx), "2026-03-29");
  assert.throws(() => resolveDay("next friday", ctx));
  // 29 March 2026: Paris moves to summer time (UTC+2) at 02:00.
  assert.equal(resolveInstant("2026-03-29T10:00", ctx, "start").toISOString(), "2026-03-29T08:00:00.000Z");
  assert.equal(resolveInstant("2026-01-10T10:00", ctx, "start").toISOString(), "2026-01-10T09:00:00.000Z");
  assert.equal(resolveInstant("2026-01-10T10:00:00Z", ctx, "start").toISOString(), "2026-01-10T10:00:00.000Z");
});

test("repeat rules read as plain English", () => {
  assert.equal(describeRepeat({ every: 2, unit: "week", weekdays: [1, 4], mode: "fixed" }), "every 2 weeks on mon, thu");
  assert.equal(describeRepeat({ every: 1, unit: "month", weekdays: [], mode: "fixed", monthDay: -1 }), "every month on the last day");
});
