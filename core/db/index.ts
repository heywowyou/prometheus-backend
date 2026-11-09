import mongoose from "mongoose";
import config from "../config";
import logger from "../logger";

/**
 * Opens the MongoDB connection. Rejects on failure so the caller can decide
 * whether to exit — the server must not start accepting requests before the
 * database is reachable.
 */
const connectDB = async (): Promise<void> => {
  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
  });
  mongoose.connection.on("error", (error) => {
    logger.error("MongoDB connection error", error);
  });

  const conn = await mongoose.connect(config.mongoUri);
  logger.info(`MongoDB connected: ${conn.connection.host}`);
};

export const disconnectDB = async (): Promise<void> => {
  await mongoose.connection.close();
};

export default connectDB;
