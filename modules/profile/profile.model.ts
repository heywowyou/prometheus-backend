import { Schema, model, type Model, type Types } from "mongoose";
import type { UserItemBase } from "../../core/domain";
import { MEDIA_LOG_TYPES, type MediaLogType } from "../media/mediaLog.model";

/** How many favorites the profile shows per media type. */
export const TOP_PICKS_LIMIT = 5;

/** Ordered media log ids, one list per media type. */
export type TopPicks = Record<MediaLogType, Types.ObjectId[]>;

/**
 * One per user. Holds what the profile page shows that doesn't belong to any
 * single subapp; name and avatar come from Clerk.
 */
export interface IProfile extends UserItemBase {
  topPicks: TopPicks;
}

const TopPicksSchema = new Schema<TopPicks>(
  Object.fromEntries(
    MEDIA_LOG_TYPES.map((type) => [
      type,
      { type: [{ type: Schema.Types.ObjectId, ref: "MediaLog" }], default: [] },
    ]),
  ),
  { _id: false },
);

const ProfileSchema = new Schema<IProfile>(
  {
    userId: { type: String, required: true },
    topPicks: { type: TopPicksSchema, default: () => ({}) },
  },
  { timestamps: true },
);

ProfileSchema.index({ userId: 1 }, { unique: true });

const Profile: Model<IProfile> = model<IProfile>("Profile", ProfileSchema);

export default Profile;
