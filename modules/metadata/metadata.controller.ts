import { asEnum, asRequiredString, asyncHandler } from "../../core/http";
import { BadRequestError } from "../../core/errors/AppError";
import { MEDIA_LOG_TYPES } from "../media/mediaLog.model";
import { METADATA_PROVIDERS } from "./metadata.types";
import * as MetadataService from "./metadata.service";

export const searchMetadata = asyncHandler(async (req, res) => {
  const type = asEnum(req.query.type, "type", MEDIA_LOG_TYPES);
  if (!type) throw new BadRequestError("type is required");

  const results = await MetadataService.searchMetadata(
    type,
    asRequiredString(req.query.q, "q", { maxLength: 200 }),
  );
  res.status(200).json(results);
});

export const getMetadataDetails = asyncHandler(async (req, res) => {
  const provider = asEnum(req.params.provider, "provider", METADATA_PROVIDERS);
  if (!provider) throw new BadRequestError("provider is required");

  const details = await MetadataService.getMetadataDetails(
    provider,
    String(req.params.id),
  );
  res.status(200).json(details);
});
