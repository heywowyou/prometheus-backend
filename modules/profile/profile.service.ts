import { Types } from "mongoose";
import MediaLog, {
  MEDIA_LOG_TYPES,
  type IMediaLog,
  type MediaLogType,
} from "../media/mediaLog.model";
import { BadRequestError } from "../../core/errors/AppError";
import Profile, { TOP_PICKS_LIMIT } from "./profile.model";

type MediaLogJson = IMediaLog & { _id: Types.ObjectId };

export interface ProfileView {
  /** Picked logs, in the user's order. Deleted logs are already left out. */
  topPicks: Record<MediaLogType, MediaLogJson[]>;
}

const emptyPicks = (): Record<MediaLogType, MediaLogJson[]> =>
  Object.fromEntries(MEDIA_LOG_TYPES.map((type) => [type, []])) as unknown as Record<
    MediaLogType,
    MediaLogJson[]
  >;

/**
 * The profile with its picks resolved to full media logs.
 *
 * Ids are resolved on read rather than kept in sync on every media delete or
 * type change: a log that no longer exists, or no longer has the row's type,
 * simply drops out, and the next save of that row writes the clean list.
 */
export const getProfile = async (userId: string): Promise<ProfileView> => {
  const profile = await Profile.findOne({ userId }).lean();
  const topPicks = emptyPicks();
  if (!profile) return { topPicks };

  const ids = MEDIA_LOG_TYPES.flatMap((type) => profile.topPicks?.[type] ?? []);
  if (ids.length === 0) return { topPicks };

  const logs = await MediaLog.find({ _id: { $in: ids }, userId }, { __v: 0 }).lean();
  const byId = new Map(logs.map((log) => [String(log._id), log as MediaLogJson]));

  for (const type of MEDIA_LOG_TYPES) {
    topPicks[type] = (profile.topPicks?.[type] ?? [])
      .map((id) => byId.get(String(id)))
      .filter((log): log is MediaLogJson => log !== undefined && log.type === type);
  }
  return { topPicks };
};

/** Replaces one row of picks. `ids` is the full ordered list (0 to 5). */
export const setTopPicks = async (
  userId: string,
  type: MediaLogType,
  ids: string[],
): Promise<ProfileView> => {
  if (ids.length > TOP_PICKS_LIMIT) {
    throw new BadRequestError(`Pick at most ${TOP_PICKS_LIMIT} titles`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestError("A title can only be picked once");
  }
  if (!ids.every((id) => Types.ObjectId.isValid(id))) {
    throw new BadRequestError("ids must be media log ids");
  }

  const objectIds = ids.map((id) => new Types.ObjectId(id));
  const owned = await MediaLog.countDocuments({ _id: { $in: objectIds }, userId, type });
  if (owned !== ids.length) {
    throw new BadRequestError(`Every pick must be one of your ${type} logs`);
  }

  await Profile.updateOne(
    { userId },
    { $set: { [`topPicks.${type}`]: objectIds } },
    { upsert: true },
  );
  return getProfile(userId);
};
