import { Router } from "express";
import { requireUser } from "../../core/auth";
import {
  searchMetadata,
  getMetadataDetails,
  getCoverOptions,
} from "./metadata.controller";

const router = Router();

router.use(requireUser);

router.get("/search", searchMetadata);
router.get("/:provider/:id/covers", getCoverOptions);
router.get("/:provider/:id", getMetadataDetails);

export default router;
