require("dotenv").config();

const express = require("express");
const connectDB = require("./config/db");

// Connect to Database
connectDB();

const app = express();
const PORT = process.env.PORT || 3000;

// Start the server
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

app.get("/", (req, res) => {
  res.send("API is running");
});
