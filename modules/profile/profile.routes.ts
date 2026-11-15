import { Router } from "express";
import { requireUser } from "../../core/auth";
import { getProfile, setTopPicks } from "./profile.controller";

const router = Router();

router.use(requireUser);

router.get("/", getProfile);
router.put("/top-picks/:type", setTopPicks);

export default router;
