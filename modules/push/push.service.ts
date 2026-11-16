import webpush from "web-push";
import config from "../../core/config";
import logger from "../../core/logger";
import { ServiceUnavailableError } from "../../core/errors/AppError";
import PushSubscription from "./push-subscription.model";
import TimerAlert from "./timer-alert.model";
import Todo from "../todos/todo.model";
import { claimDueReminders } from "../calendar/calendar.service";
import { localTimeKey } from "../../core/domain";

export const pushEnabled = Boolean(config.push.publicKey && config.push.privateKey);

if (pushEnabled) {
  webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey);
}

const assertEnabled = () => {
  if (!pushEnabled) throw new ServiceUnavailableError("Notifications aren't configured on the server");
};

export const getPublicKey = (): string => {
  assertEnabled();
  return config.push.publicKey;
};

export const subscribe = async (
  userId: string,
  input: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent: string },
) => {
  assertEnabled();
  // The endpoint is unique per browser; re-subscribing moves it to this user.
  await PushSubscription.findOneAndUpdate(
    { endpoint: input.endpoint },
    { $set: { userId, keys: input.keys, userAgent: input.userAgent } },
    { upsert: true },
  );
};

export const unsubscribe = async (userId: string, endpoint: string) => {
  await PushSubscription.deleteOne({ userId, endpoint });
};

export interface PushPayload {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string;
  /** Replaces an earlier notification with the same tag. */
  tag?: string;
}

/** Sends to every device of the user; drops subscriptions the push service says are gone. */
export const sendToUser = async (userId: string, payload: PushPayload): Promise<number> => {
  assertEnabled();
  const subscriptions = await PushSubscription.find({ userId }).lean();
  let delivered = 0;
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          JSON.stringify(payload),
          { TTL: 60 * 60 },
        );
        delivered += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await PushSubscription.deleteOne({ _id: subscription._id });
        } else {
          logger.warn(`Push to ${subscription.endpoint.slice(0, 40)}… failed (${status ?? "network"})`);
        }
      }
    }),
  );
  return delivered;
};

/** Reminders older than this when the job sees them are dropped, not sent late. */
const STALE_MS = 6 * 60 * 60 * 1000;
const JOB_INTERVAL_MS = 60 * 1000;
/** Timer alerts are checked more often: a focus block ending a minute late feels broken. */
const TIMER_JOB_INTERVAL_MS = 10 * 1000;

const formatTime = (time: string) => time;

/** Sends the task reminders that are due. One instance runs this; Railway runs one replica. */
export const sendDueReminders = async (now = new Date()): Promise<number> => {
  const due = await Todo.find({
    reminderAt: { $lte: now, $gte: new Date(now.getTime() - STALE_MS) },
    reminderSentAt: null,
    completed: false,
    recurrenceType: "none",
  }).limit(200);

  let sent = 0;
  for (const todo of due) {
    // Claim it first, so an overlapping run can't send it twice.
    const claimed = await Todo.updateOne(
      { _id: todo._id, reminderSentAt: null },
      { $set: { reminderSentAt: now } },
    );
    if (claimed.modifiedCount === 0) continue;
    await sendToUser(todo.userId, {
      title: todo.text,
      body: todo.time ? `Today at ${formatTime(todo.time)}` : "Reminder",
      url: "/todos/today",
      tag: `todo-${String(todo._id)}`,
    });
    sent += 1;
  }
  return sent;
};

/** Sends calendar event reminders that are due. */
export const sendDueEventReminders = async (now = new Date()): Promise<number> => {
  const claimed = await claimDueReminders(now);
  for (const { event, at } of claimed) {
    const lead = event.remindMinutes ?? 0;
    const startsAt = new Date(at.getTime() + lead * 60_000);
    const when = event.allDay
      ? "Today"
      : lead === 0
        ? `Now, ${localTimeKey(startsAt, event.timeZone)}`
        : `At ${localTimeKey(startsAt, event.timeZone)}`;
    await sendToUser(event.userId, {
      title: event.title || "Event",
      body: event.location ? `${when} · ${event.location}` : when,
      url: "/calendar",
      tag: `event-${String(event._id)}`,
    });
  }
  return claimed.length;
};

/** Schedules (or moves) the caller's focus timer alert. */
export const scheduleTimerAlert = async (
  userId: string,
  alert: { sendAt: Date; title: string; body: string },
): Promise<void> => {
  await TimerAlert.updateOne(
    { userId },
    { $set: { ...alert, sentAt: null } },
    { upsert: true },
  );
};

export const cancelTimerAlert = async (userId: string): Promise<void> => {
  await TimerAlert.deleteOne({ userId });
};

/** Sends focus timer alerts that are due. */
export const sendDueTimerAlerts = async (now = new Date()): Promise<number> => {
  const due = await TimerAlert.find({
    sentAt: null,
    sendAt: { $lte: now, $gte: new Date(now.getTime() - STALE_MS) },
  }).limit(50);
  let sent = 0;
  for (const alert of due) {
    const claimed = await TimerAlert.updateOne({ _id: alert._id, sentAt: null }, { $set: { sentAt: now } });
    if (claimed.modifiedCount === 0) continue;
    await sendToUser(alert.userId, { title: alert.title, body: alert.body, url: "/", tag: "focus-timer" });
    sent += 1;
  }
  return sent;
};

let timer: NodeJS.Timeout | null = null;
let timerAlertJob: NodeJS.Timeout | null = null;

export const startReminderJob = () => {
  if (!pushEnabled) {
    logger.info("Push keys not set: task reminders are off");
    return;
  }
  if (timer) return;
  timer = setInterval(() => {
    sendDueReminders().catch((error: unknown) => logger.error("Reminder job failed", error));
    sendDueEventReminders().catch((error: unknown) => logger.error("Event reminder job failed", error));
  }, JOB_INTERVAL_MS);
  timer.unref();
  timerAlertJob = setInterval(() => {
    sendDueTimerAlerts().catch((error: unknown) => logger.error("Timer alert job failed", error));
  }, TIMER_JOB_INTERVAL_MS);
  timerAlertJob.unref();
  logger.info("Task reminder job started");
};

export const stopReminderJob = () => {
  if (timer) clearInterval(timer);
  if (timerAlertJob) clearInterval(timerAlertJob);
  timer = null;
  timerAlertJob = null;
};
