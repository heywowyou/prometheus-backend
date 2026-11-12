import { Router } from "express";
import { requireUser } from "../../core/auth";
import { downloadExport } from "./export.controller";

const router = Router();

router.use(requireUser);

router.get("/", downloadExport);

export default router;
