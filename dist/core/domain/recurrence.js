"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextResetTime = exports.isRecurrenceType = exports.RECURRENCE_TYPES = void 0;
exports.RECURRENCE_TYPES = ["none", "daily", "weekly", "monthly"];
const isRecurrenceType = (value) => typeof value === "string" &&
    exports.RECURRENCE_TYPES.includes(value);
exports.isRecurrenceType = isRecurrenceType;
/**
 * When a recurring item last completed at `lastCompletedAt` becomes due again.
 *
 * Returns the epoch for items that have never been completed, so callers can
 * compare `now >= getNextResetTime(...)` without special-casing null.
 */
const getNextResetTime = (lastCompletedAt, type) => {
    if (!lastCompletedAt)
        return new Date(0);
    const date = new Date(lastCompletedAt);
    if (Number.isNaN(date.getTime()))
        return new Date(0);
    switch (type) {
        case "daily":
            date.setDate(date.getDate() + 1);
            break;
        case "weekly": {
            // Recurring weekly items reset on the following Monday.
            const dayOfWeek = date.getDay();
            const daysUntilNextMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7 || 7;
            date.setDate(date.getDate() + daysUntilNextMonday);
            break;
        }
        case "monthly":
            date.setMonth(date.getMonth() + 1);
            date.setDate(1);
            break;
        case "none":
            break;
    }
    date.setHours(0, 0, 0, 0);
    return date;
};
exports.getNextResetTime = getNextResetTime;
//# sourceMappingURL=recurrence.js.map