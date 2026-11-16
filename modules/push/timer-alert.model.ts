import { Schema, model, type Model } from "mongoose";

/**
 * A one-off notification for a running focus timer, so the end is announced
 * even when the app is closed or the phone has suspended it. One per user.
 */
export interface ITimerAlert {
  userId: string;
  sendAt: Date;
  title: string;
  body: string;
  sentAt: Date | null;
}

const TimerAlertSchema = new Schema<ITimerAlert>(
  {
    userId: { type: String, required: true, unique: true },
    sendAt: { type: Date, required: true },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, default: "", maxlength: 240 },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

TimerAlertSchema.index({ sentAt: 1, sendAt: 1 });

const TimerAlert: Model<ITimerAlert> = model<ITimerAlert>("TimerAlert", TimerAlertSchema);

export default TimerAlert;
