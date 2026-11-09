import type { Types } from "mongoose";

/**
 * Fields shared by every user-owned document. Module models extend this so the
 * ownership and timestamp contract stays identical across subapps.
 */
export interface UserItemBase {
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Fields shared by append-only history/event documents. */
export interface HistoryEventBase {
  itemId: Types.ObjectId;
  userId: string;
  timestamp: Date;
  type: string;
  payload?: Record<string, unknown>;
}
