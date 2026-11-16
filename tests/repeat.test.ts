import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceRepeat, alignToRule, nextOccurrence, type RepeatRule } from "../modules/todos/repeat";
import { zonedInstant } from "../core/domain/recurrence";

const rule = (partial: Partial<RepeatRule>): RepeatRule => ({
  every: 1,
  unit: "day",
  weekdays: [],
  mode: "fixed",
  ...partial,
});

test("monthly repeats clamp to the end of shorter months", () => {
  assert.equal(nextOccurrence("2026-01-31", rule({ unit: "month" })), "2026-02-28");
  assert.equal(nextOccurrence("2024-02-29", rule({ unit: "year" })), "2025-02-28");
});

test("weekly repeats on chosen weekdays, every N weeks", () => {
  const monWed = rule({ unit: "week", weekdays: [1, 3] });
  assert.equal(nextOccurrence("2026-11-16", monWed), "2026-11-18");
  assert.equal(nextOccurrence("2026-11-18", monWed), "2026-11-23");
  assert.equal(nextOccurrence("2026-11-18", { ...monWed, every: 2 }), "2026-11-30");
});

test("fixed schedules skip occurrences already past", () => {
  assert.equal(advanceRepeat(rule({}), "2026-11-01", "2026-11-16"), "2026-11-17");
  assert.equal(advanceRepeat(rule({ unit: "month" }), "2026-11-01", "2026-11-16"), "2026-12-01");
});

test("after-completion schedules count from today", () => {
  assert.equal(
    advanceRepeat(rule({ every: 2, mode: "afterCompletion" }), "2026-11-01", "2026-11-16"),
    "2026-11-18",
  );
});

test("reminder instants follow the user's zone across DST", () => {
  assert.equal(zonedInstant("2026-11-16", "09:30", "Europe/Paris").toISOString(), "2026-11-16T08:30:00.000Z");
  assert.equal(zonedInstant("2026-07-01", "09:30", "Europe/Paris").toISOString(), "2026-07-01T07:30:00.000Z");
});

test("monthly on a set day of the month", () => {
  const first = rule({ unit: "month", monthDay: 1 });
  assert.equal(nextOccurrence("2026-11-16", first), "2026-12-01");
  assert.equal(nextOccurrence("2026-12-01", first), "2027-01-01");
  const last = rule({ unit: "month", monthDay: -1 });
  assert.equal(nextOccurrence("2026-01-31", last), "2026-02-28");
  assert.equal(nextOccurrence("2026-02-10", last), "2026-02-28");
  const thirtyFirst = rule({ unit: "month", monthDay: 31 });
  assert.equal(nextOccurrence("2026-01-31", thirtyFirst), "2026-02-28");
  assert.equal(nextOccurrence("2026-02-28", thirtyFirst), "2026-03-31");
});

test("a task switched to the 1st moves to the next 1st, or stays on one", () => {
  const first = rule({ unit: "month", monthDay: 1 });
  assert.equal(alignToRule("2026-11-16", first), "2026-12-01");
  assert.equal(alignToRule("2026-12-01", first), "2026-12-01");
  // Rules without a set day leave the day alone.
  assert.equal(alignToRule("2026-11-16", rule({ unit: "month" })), "2026-11-16");
});

test("done late, a monthly-on-the-1st task comes back on the next 1st", () => {
  const first = rule({ unit: "month", monthDay: 1 });
  assert.equal(advanceRepeat(first, "2026-11-01", "2026-11-16"), "2026-12-01");
});
