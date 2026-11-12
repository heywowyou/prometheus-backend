/**
 * Base class for errors that carry an intended HTTP status.
 *
 * Services throw these; the error-handling middleware turns them into
 * responses. Anything that is *not* an AppError is treated as an unexpected
 * failure and reported as a 500 without leaking its message.
 */
export class AppError extends Error {
  readonly status: number;
  /** Machine-readable code, surfaced to clients for programmatic handling. */
  readonly code: string;
  /** Optional field-level detail, e.g. `{ rating: "must be between 1 and 10" }`. */
  readonly details?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, string>,
  ) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: Record<string, string>) {
    super(400, "BAD_REQUEST", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Not authorized") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, "NOT_FOUND", `${resource} not found`);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message: string) {
    super(422, "UNPROCESSABLE_ENTITY", message);
  }
}

/** A third-party service we depend on failed or returned something unusable. */
export class UpstreamError extends AppError {
  constructor(message: string) {
    super(502, "UPSTREAM_ERROR", message);
  }
}

/** A feature is switched off, e.g. because its credentials aren't configured. */
export class ServiceUnavailableError extends AppError {
  constructor(message: string) {
    super(503, "SERVICE_UNAVAILABLE", message);
  }
}

/** The request clashes with the current state, e.g. a second live workout. */
export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}
