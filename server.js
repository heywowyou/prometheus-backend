require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./core/db");
const { todoRoutes } = require("./modules/todos");

connectDB();

const app = express();

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("API is running");
});

app.use("/api/todos", todoRoutes);

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

