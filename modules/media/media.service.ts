import MediaLog, { type IMediaLog } from "./mediaLog.model";
import type { Document } from "mongoose";

export const toggleFavorite = async (
  id: string,
  userId: string
): Promise<Document & IMediaLog> => {
  const log = await MediaLog.findOne({ _id: id, userId });
  if (!log) {
    const error = new Error("Media log not found");
    (error as NodeJS.ErrnoException).code = "NOT_FOUND";
    throw error;
  }
  log.favorite = !log.favorite;
  await log.save();
  return log;
};
