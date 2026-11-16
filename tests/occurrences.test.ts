import { test } from "node:test";
import assert from "node:assert/strict";
import { expandOccurrences, nextReminder } from "../modules/calendar/occurrences";
import { zonedInstant } from "../core/domain/recurrence";

const tz = "Europe/Paris";
const day = (key: string) => zonedInstant(key, "00:00", tz);

test("a weekly 9:00 meeting stays at 9:00 across the October clock change", () => {
  const event = {
    allDay: false,
    start: zonedInstant("2026-10-19", "09:00", tz),
    end: zonedInstant("2026-10-19", "10:00", tz),
    timeZone: tz,
    repeat: { every: 1, unit: "week" as const, weekdays: [], until: null },
  };
  const occurrences = expandOccurrences(event, day("2026-10-19"), day("2026-11-03"));
  assert.deepEqual(
    occurrences.map((o) => o.start.toISOString()),
    ["2026-10-19T07:00:00.000Z", "2026-10-26T08:00:00.000Z", "2026-11-02T08:00:00.000Z"],
  );
  assert.ok(occurrences.every((o) => o.end.getTime() - o.start.getTime() === 3_600_000));
});

test("excluded days and the until day bound a series", () => {
  const event = {
    allDay: true,
    startDay: "2026-11-16",
    endDay: "2026-11-16",
    timeZone: tz,
    repeat: { every: 1, unit: "day" as const, weekdays: [], until: "2026-11-20" },
    exdates: ["2026-11-18"],
  };
  const days = expandOccurrences(event, day("2026-11-01"), day("2026-12-01")).map((o) => o.day);
  assert.deepEqual(days, ["2026-11-16", "2026-11-17", "2026-11-19", "2026-11-20"]);
});

test("a multi-day all-day event overlaps every day it covers", () => {
  const event = { allDay: true, startDay: "2026-11-20", endDay: "2026-11-22", timeZone: tz };
  assert.equal(expandOccurrences(event, day("2026-11-22"), day("2026-11-23")).length, 1);
  assert.equal(expandOccurrences(event, day("2026-11-23"), day("2026-11-24")).length, 0);
});

test("reminders fire before each occurrence, then move to the next", () => {
  const event = {
    allDay: false,
    start: zonedInstant("2026-11-16", "09:00", tz),
    end: zonedInstant("2026-11-16", "10:00", tz),
    timeZone: tz,
    repeat: { every: 1, unit: "day" as const, weekdays: [], until: null },
    remindMinutes: 15,
  };
  const first = nextReminder(event, zonedInstant("2026-11-16", "07:00", tz));
  assert.equal(first?.toISOString(), "2026-11-16T07:45:00.000Z");
  const second = nextReminder(event, first as Date);
  assert.equal(second?.toISOString(), "2026-11-17T07:45:00.000Z");
});
