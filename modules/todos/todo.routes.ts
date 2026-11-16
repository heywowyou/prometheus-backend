import { Router } from "express";
import {
  listTodos,
  createTodo,
  updateTodo,
  toggleTodo,
  updateTimer,
  reorderTodos,
  getTodoHistory,
  pauseTodo,
  resumeTodo,
  deleteTodo,
  convertTodo,
  listLogbook,
  getLists,
  createArea,
  updateArea,
  deleteArea,
  createProject,
  updateProject,
  deleteProject,
  reorderLists,
  getHabitCompletions,
} from "./todo.controller";
import { requireUser } from "../../core/auth";

const router = Router();

router.use(requireUser);

router.route("/").get(listTodos).post(createTodo);
// Before /:id, which would otherwise read these segments as ids.
router.patch("/reorder", reorderTodos);
router.get("/logbook", listLogbook);
router.get("/habits/completions", getHabitCompletions);
router.get("/lists", getLists);
router.patch("/lists/reorder", reorderLists);
router.post("/areas", createArea);
router.route("/areas/:id").patch(updateArea).delete(deleteArea);
router.post("/projects", createProject);
router.route("/projects/:id").patch(updateProject).delete(deleteProject);

// Completion is its own endpoint: toggling and editing fields were previously
// inferred from the request body shape, which made both paths easy to break.
router.patch("/:id/toggle", toggleTodo);
router.patch("/:id/timer", updateTimer);
router.get("/:id/history", getTodoHistory);
router.patch("/:id/pause", pauseTodo);
router.patch("/:id/resume", resumeTodo);
router.patch("/:id/convert", convertTodo);

router.route("/:id").patch(updateTodo).delete(deleteTodo);

export default router;
