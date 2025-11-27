// Import the express library
const express = require("express");

// Initialize the app
const app = express();

// Define the port
const PORT = 3000;

// Start the server
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
