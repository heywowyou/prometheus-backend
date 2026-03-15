import { Router } from "express";
import {
  getTodos,
  createTodo,
  updateTodo,
  deleteTodo,
} from "./todo.controller";
import requireUser from "../../core/auth/requireUser";

const router = Router();

router.use(requireUser);

router.route("/").get(getTodos).post(createTodo);

router.route("/:id").put(updateTodo).delete(deleteTodo);

export default router;

