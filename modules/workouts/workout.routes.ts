import { Router } from "express";
import { requireUser } from "../../core/auth";
import {
  listExercises,
  createExercise,
  updateExercise,
  deleteExercise,
  getExerciseProgress,
  getLastSets,
  listRoutines,
  getRoutine,
  createRoutine,
  updateRoutine,
  reorderRoutines,
  deleteRoutine,
  getActiveSession,
  listSessions,
  startSession,
  getSession,
  updateSession,
  finishSession,
  deleteSession,
  getHistory,
  getSummary,
} from "./workout.controller";

const router = Router();

router.use(requireUser);

router.get("/history", getHistory);
router.get("/summary", getSummary);

router.route("/exercises").get(listExercises).post(createExercise);
router.get("/exercises/:id/progress", getExerciseProgress);
router.get("/exercises/:id/last", getLastSets);
router.route("/exercises/:id").patch(updateExercise).delete(deleteExercise);

router.route("/routines").get(listRoutines).post(createRoutine);
// Before /routines/:id so "reorder" isn't read as an id.
router.patch("/routines/reorder", reorderRoutines);
router.route("/routines/:id").get(getRoutine).patch(updateRoutine).delete(deleteRoutine);

router.route("/sessions").get(listSessions).post(startSession);
router.get("/sessions/active", getActiveSession);
router.patch("/sessions/:id/finish", finishSession);
router.route("/sessions/:id").get(getSession).patch(updateSession).delete(deleteSession);

export default router;
