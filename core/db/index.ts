import mongoose from "mongoose";

const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      console.error("MONGODB_URI is not set in this environment");
      throw new Error("MONGODB_URI environment variable is not set");
    }

    const conn = await mongoose.connect(mongoUri);

    // eslint-disable-next-line no-console
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    const err = error as Error;
    // eslint-disable-next-line no-console
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
};

export default connectDB;

