import { Router } from "express";
import {
  getTodos,
  createTodo,
  updateTodo,
  pauseTodo,
  resumeTodo,
  deleteTodo,
} from "./todo.controller";
import requireUser from "../../core/auth/requireUser";

const router = Router();

router.use(requireUser);

router.route("/").get(getTodos).post(createTodo);

router.patch("/:id/pause", pauseTodo);
router.patch("/:id/resume", resumeTodo);

router.route("/:id").put(updateTodo).delete(deleteTodo);

export default router;

