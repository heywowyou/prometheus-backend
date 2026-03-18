import dotenv from "dotenv";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import connectDB from "./core/db";
import { todoRoutes } from "./modules/todos";
import { mediaLogRoutes } from "./modules/media";
import { imageRoutes } from "./modules/images";

dotenv.config();

connectDB();

const app = express();

app.use(
  cors({ origin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").trim() }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(clerkMiddleware());

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.get("/", (_req: Request, res: Response) => {
  res.send("API is running");
});

app.use("/api/todos", todoRoutes);
app.use("/api/media", mediaLogRoutes);
app.use("/api/images", imageRoutes);

// Global error handler — must be registered after all routes
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err.stack);
  res.status(500).json({ message: err.message ?? "Internal server error" });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server started on port ${PORT}`);
});
