const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // Attempt to connect using the environment variable
    const conn = await mongoose.connect(process.env.MONGODB_URI);

    // Log success with the host name so we know where we are connected
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    // If something goes wrong, log it and kill the process
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
