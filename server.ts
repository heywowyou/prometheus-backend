import dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import connectDB from "./core/db";
import { todoRoutes } from "./modules/todos";
import { mediaLogRoutes } from "./modules/media";

dotenv.config();

connectDB();

const app = express();

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(clerkMiddleware());

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.get("/", (_req: Request, res: Response) => {
  res.send("API is running");
});

app.use("/api/todos", todoRoutes);
app.use("/api/media", mediaLogRoutes);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server started on port ${PORT}`);
});

