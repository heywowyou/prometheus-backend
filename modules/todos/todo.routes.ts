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
} from "./todo.controller";
import { requireUser } from "../../core/auth";

const router = Router();

router.use(requireUser);

router.route("/").get(listTodos).post(createTodo);
// Before /:id, which would otherwise read "reorder" as an id.
router.patch("/reorder", reorderTodos);

// Completion is its own endpoint: toggling and editing fields were previously
// inferred from the request body shape, which made both paths easy to break.
router.patch("/:id/toggle", toggleTodo);
router.patch("/:id/timer", updateTimer);
router.get("/:id/history", getTodoHistory);
router.patch("/:id/pause", pauseTodo);
router.patch("/:id/resume", resumeTodo);

router.route("/:id").patch(updateTodo).delete(deleteTodo);

export default router;
