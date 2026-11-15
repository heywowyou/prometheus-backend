import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceRepeat, nextOccurrence, type RepeatRule } from "../modules/todos/repeat";
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
