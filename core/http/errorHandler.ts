import type { ErrorRequestHandler, RequestHandler } from "express";
import { MulterError } from "multer";
import mongoose from "mongoose";
import { AppError, NotFoundError } from "../errors/AppError";
import logger from "../logger";
import { isProduction } from "../config";

interface ErrorBody {
  message: string;
  code: string;
  details?: Record<string, string>;
}

/** Translates known error shapes into a status + client-safe body. */
const describe = (err: unknown): { status: number; body: ErrorBody } => {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { message: err.message, code: err.code, details: err.details },
    };
  }

  if (err instanceof MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "File is larger than the 5 MB limit"
        : `Upload rejected: ${err.message}`;
    return { status: 400, body: { message, code: err.code } };
  }

  // A malformed ObjectId in a path param is a client error, not a server one.
  if (err instanceof mongoose.Error.CastError) {
    return {
      status: 400,
      body: { message: `Invalid ${err.path}`, code: "INVALID_ID" },
    };
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.fromEntries(
      Object.entries(err.errors).map(([field, e]) => [field, e.message]),
    );
    return {
      status: 400,
      body: { message: "Validation failed", code: "VALIDATION_FAILED", details },
    };
  }

  return {
    status: 500,
    body: { message: "Internal server error", code: "INTERNAL_ERROR" },
  };
};

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const { status, body } = describe(err);

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} failed`, err);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} → ${status} ${body.code}`);
  }

  // Headers already flushed (e.g. a stream failed mid-response): the only
  // correct move is to destroy the connection rather than append a JSON body.
  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(status).json(
    isProduction || status < 500
      ? body
      : { ...body, stack: err instanceof Error ? err.stack : undefined },
  );
};
