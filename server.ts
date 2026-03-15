import dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import cors from "cors";
import connectDB from "./core/db";
import { todoRoutes } from "./modules/todos";

dotenv.config();

connectDB();

const app = express();

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.get("/", (_req: Request, res: Response) => {
  res.send("API is running");
});

app.use("/api/todos", todoRoutes);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server started on port ${PORT}`);
});

