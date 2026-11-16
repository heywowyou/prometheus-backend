import mongoose from "mongoose";
import Todo from "./todo.model";
import { advanceRepeat } from "./repeat";
import { localDateKey } from "../../core/domain";
import { logger } from "../../core/logger";
import { copyHabitHistoryToCompleted } from "./todo.service";

const MIGRATION_ID = "todos-things-v1";
const BACKUP_COLLECTION = "todos_backup_2026_11_16";
// The server doesn't know the user's zone; Jules is in Paris and this runs once.
const MIGRATION_TIME_ZONE = "Europe/Paris";

/**
 * One-off move to the Things-style model, guarded by a marker document so it
 * never runs twice (a monthly habit made later must stay a habit):
 *
 * 1. Copies the whole `todos` collection to a backup collection first.
 * 2. Done one-time tasks get `completedAt` (they go to the Logbook).
 * 3. Monthly habits become monthly repeating tasks, due on the 1st: next
 *    month's if already done this month, this month's otherwise; paused ones
 *    go to Someday. Their history is kept.
 *
 * Daily and weekly habits are left as they are.
 */
export const migrateTodosToThings = async (): Promise<void> => {
  const db = mongoose.connection.db;
  if (!db) return;
  const markers = db.collection<{ _id: string; at: Date }>("migrations");
  if (await markers.findOne({ _id: MIGRATION_ID })) return;

  const hasBackup = await db.listCollections({ name: BACKUP_COLLECTION }).hasNext();
  if (!hasBackup) {
    await Todo.collection.aggregate([{ $match: {} }, { $out: BACKUP_COLLECTION }]).toArray();
    logger.info(`Backed up todos to ${BACKUP_COLLECTION}`);
  }

  await Todo.collection.updateMany(
    { recurrenceType: "none", completed: true, completedAt: { $in: [null] } },
    [{ $set: { completedAt: { $ifNull: ["$lastCompletedAt", "$updatedAt"] } } }],
  );

  const now = new Date();
  const today = localDateKey(now, MIGRATION_TIME_ZONE);
  const thisMonth = today.slice(0, 7);
  const monthly = await Todo.find({ recurrenceType: "monthly" });
  for (const todo of monthly) {
    const rule = { every: 1, unit: "month" as const, weekdays: [], mode: "fixed" as const };
    const firstOfMonth = `${thisMonth}-01`;
    const doneThisMonth =
      todo.lastCompletedAt && localDateKey(todo.lastCompletedAt, MIGRATION_TIME_ZONE).slice(0, 7) === thisMonth;
    todo.recurrenceType = "none";
    todo.repeat = rule;
    todo.when = todo.paused ? "someday" : doneThisMonth ? advanceRepeat(rule, firstOfMonth, today) : firstOfMonth;
    todo.completed = false;
    todo.completedAt = null;
    todo.paused = false;
    todo.pausedAt = undefined;
    await todo.save();
  }

  await markers.insertOne({ _id: MIGRATION_ID, at: now });
  logger.info(`Todos migrated to the Things model (${monthly.length} monthly habits now repeat as tasks)`);
};

const HISTORY_COPIES_ID = "habit-history-to-completed-v1";

/**
 * One-off: habits turned into repeating tasks before conversions copied their
 * history (the Things migration, and "Turn into a repeating task" until Nov
 * 16, 2026) get a Completed entry for each past tick. Marker-guarded, so
 * copies deleted later aren't recreated.
 */
export const backfillHabitHistoryCopies = async (): Promise<void> => {
  const db = mongoose.connection.db;
  if (!db) return;
  const markers = db.collection<{ _id: string; at: Date }>("migrations");
  if (await markers.findOne({ _id: HISTORY_COPIES_ID })) return;

  const repeating = await Todo.find({ recurrenceType: "none", repeat: { $ne: null }, repeatOf: null });
  let made = 0;
  for (const todo of repeating) {
    made += await copyHabitHistoryToCompleted(todo, MIGRATION_TIME_ZONE);
  }
  await markers.insertOne({ _id: HISTORY_COPIES_ID, at: new Date() });
  logger.info(`Copied ${made} past habit ticks into Completed`);
};
