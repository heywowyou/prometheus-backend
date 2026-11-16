import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStreak, cycleKey } from "../core/domain";

const TZ = "Europe/Paris";
const at = (day: string, time = "12:00") => new Date(`${day}T${time}:00+01:00`);

test("a daily streak counts consecutive days and survives an open today", () => {
  const done = ["2026-11-10", "2026-11-11", "2026-11-12"].map((day) => at(day));
  assert.deepEqual(computeStreak(done, "daily", TZ, at("2026-11-13")), { current: 3, best: 3 });
});

test("a missed day breaks a daily streak", () => {
  const done = ["2026-11-10", "2026-11-11", "2026-11-13"].map((day) => at(day));
  assert.deepEqual(computeStreak(done, "daily", TZ, at("2026-11-14")), { current: 1, best: 2 });
});

test("a skipped day bridges the streak without adding to it", () => {
  const done = ["2026-11-10", "2026-11-11", "2026-11-13"].map((day) => at(day));
  assert.deepEqual(computeStreak(done, "daily", TZ, at("2026-11-14"), ["2026-11-12"]), { current: 3, best: 3 });
});

test("skipping today keeps yesterday's streak", () => {
  const done = ["2026-11-12", "2026-11-13"].map((day) => at(day));
  assert.deepEqual(computeStreak(done, "daily", TZ, at("2026-11-14"), ["2026-11-14"]), { current: 2, best: 2 });
});

test("cycle keys are the day, the Monday or the 1st", () => {
  const thursday = at("2026-11-19", "23:30");
  assert.equal(cycleKey(thursday, "daily", TZ), "2026-11-19");
  assert.equal(cycleKey(thursday, "weekly", TZ), "2026-11-16");
  assert.equal(cycleKey(thursday, "monthly", TZ), "2026-11-01");
  // Sunday late evening in Paris is still that week.
  assert.equal(cycleKey(at("2026-11-22", "23:59"), "weekly", TZ), "2026-11-16");
});

test("a skipped week bridges a weekly streak", () => {
  const done = ["2026-11-02", "2026-11-16"].map((day) => at(day));
  assert.deepEqual(computeStreak(done, "weekly", TZ, at("2026-11-17"), ["2026-11-09"]), { current: 2, best: 2 });
});
