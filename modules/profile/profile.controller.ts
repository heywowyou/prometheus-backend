import { getUserId } from "../../core/auth";
import { asEnum, asyncHandler } from "../../core/http";
import { BadRequestError } from "../../core/errors/AppError";
import { MEDIA_LOG_TYPES } from "../media/mediaLog.model";
import * as ProfileService from "./profile.service";

export const getProfile = asyncHandler(async (req, res) => {
  res.status(200).json(await ProfileService.getProfile(getUserId(req)));
});

export const setTopPicks = asyncHandler(async (req, res) => {
  const type = asEnum(req.params.type, "type", MEDIA_LOG_TYPES);
  if (!type) throw new BadRequestError("type is required");

  const ids = (req.body as Record<string, unknown> | undefined)?.ids;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
    throw new BadRequestError("ids must be an array of media log ids");
  }

  res.status(200).json(await ProfileService.setTopPicks(getUserId(req), type, ids));
});
