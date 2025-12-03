const express = require("express");
const router = express.Router();
const {
  getTodos,
  createTodo,
  updateTodo,
  deleteTodo,
} = require("../controllers/todoController");

// Route for GET (all) and POST (create new) on the base path /api/todos
router.route("/").get(getTodos).post(createTodo);

// Route for PUT (update) and DELETE (delete) on the path /api/todos/:id
router.route("/:id").put(updateTodo).delete(deleteTodo);

module.exports = router;
