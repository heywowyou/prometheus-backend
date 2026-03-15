const express = require("express");
const {
  getTodos,
  createTodo,
  updateTodo,
  deleteTodo,
} = require("./todo.controller");
const requireUser = require("../../core/auth/requireUser");

const router = express.Router();

router.use(requireUser);

router.route("/").get(getTodos).post(createTodo);

router.route("/:id").put(updateTodo).delete(deleteTodo);

module.exports = router;


