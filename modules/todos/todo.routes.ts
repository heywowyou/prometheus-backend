import { Router } from "express";
import {
  listTodos,
  createTodo,
  updateTodo,
  toggleTodo,
  pauseTodo,
  resumeTodo,
  deleteTodo,
} from "./todo.controller";
import { requireUser } from "../../core/auth";

const router = Router();

router.use(requireUser);

router.route("/").get(listTodos).post(createTodo);

// Completion is its own endpoint: toggling and editing fields were previously
// inferred from the request body shape, which made both paths easy to break.
router.patch("/:id/toggle", toggleTodo);
router.patch("/:id/pause", pauseTodo);
router.patch("/:id/resume", resumeTodo);

router.route("/:id").patch(updateTodo).delete(deleteTodo);

export default router;
