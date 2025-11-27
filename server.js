require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const todoRoutes = require("./routes/todoRoutes");

// Connect to Database
connectDB();

const app = express();

// Allows the app to parse JSON body data (needed for POST/PUT requests)
app.use(express.json());
// Allows the app to parse form/url encoded data
app.use(express.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("API is running");
});

// Use the todoRoutes for any requests starting with /api/todos
app.use("/api/todos", todoRoutes);

// Start the server
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
