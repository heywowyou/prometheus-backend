import express, { type Request, type Response } from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";

import config from "./core/config";
import logger from "./core/logger";
import connectDB, { disconnectDB } from "./core/db";
import { errorHandler, notFoundHandler } from "./core/http";

import { todoRoutes, migrateLegacyHoldTodos } from "./modules/todos";
import { mediaLogRoutes } from "./modules/media";
import { imageRoutes } from "./modules/images";
import { noteRoutes } from "./modules/notes";
import { metadataRoutes } from "./modules/metadata";
import { exportRoutes } from "./modules/export";
import { workoutRoutes } from "./modules/workouts";

export const createApp = () => {
  const app = express();

  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  // Note bodies are Tiptap HTML and outgrow the 100 KB default.
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false, limit: "2mb" }));
  app.use(clerkMiddleware());

  // Kept at both paths: /health for probes, / for anything still pinging the
  // root the way the pre-refactor server answered it.
  const health = (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  };
  app.get("/", health);
  app.get("/health", health);

  app.use("/api/todos", todoRoutes);
  app.use("/api/media", mediaLogRoutes);
  app.use("/api/images", imageRoutes);
  app.use("/api/notes", noteRoutes);
  app.use("/api/workouts", workoutRoutes);
  app.use("/api/metadata", metadataRoutes);
  app.use("/api/export", exportRoutes);

  // Must come after every route: unmatched paths become a 404, and all thrown
  // or rejected handlers land in one place.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

const start = async () => {
  // Connect before listening so the first request can't hit a cold database.
  await connectDB();

  // One-off data fix-ups, safe to re-run on every boot.
  const migrated = await migrateLegacyHoldTodos();
  if (migrated > 0) logger.info(`Migrated ${migrated} "hold" todos`);

  const server = createApp().listen(config.port, () => {
    logger.info(`Server listening on port ${config.port} (${config.env})`);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => {
      void disconnectDB().finally(() => process.exit(0));
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

// Guarded so the app can be imported by a test or script without listening.
if (require.main === module) {
  start().catch((error) => {
    logger.error("Failed to start server", error);
    process.exit(1);
  });
}
