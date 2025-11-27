const express = require("express");
const router = express.Router();
const { getTodos, createTodo } = require("../controllers/todoController");

// Map the HTTP method and URL path to the controller function
router.route("/").get(getTodos).post(createTodo);

module.exports = router;
