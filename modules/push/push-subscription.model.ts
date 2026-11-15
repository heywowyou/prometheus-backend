import { Schema, model, type Model } from "mongoose";

/** One browser or installed app that accepted notifications. */
export interface IPushSubscription {
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent: string;
}

const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: String, required: true, index: true },
    endpoint: { type: String, required: true, unique: true, maxlength: 2000 },
    keys: {
      p256dh: { type: String, required: true, maxlength: 200 },
      auth: { type: String, required: true, maxlength: 100 },
    },
    userAgent: { type: String, default: "", maxlength: 400 },
  },
  { timestamps: true },
);

const PushSubscription: Model<IPushSubscription> = model<IPushSubscription>(
  "PushSubscription",
  PushSubscriptionSchema,
);

export default PushSubscription;
