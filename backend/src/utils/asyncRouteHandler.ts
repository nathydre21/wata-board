/**
 * Async Route Handler Utility
 *
 * Provides a lightweight AppError class and an asyncRoute wrapper that
 * eliminates repetitive try/catch blocks from route handlers by forwarding
 * errors to Express error-handling middleware.
 */

import { Request, Response, NextFunction } from 'express';

// ── AppError ───────────────────────────────────────────────

/**
 * An application-level error that carries an HTTP status code and optional
 * structured payload (e.g. validation error arrays, rate-limit info).
 *
 * Throw this from any route handler / service and the centralized error
 * middleware will serialise it into a standardised JSON response.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  /** Additional data merged into the JSON body (e.g. `errors`, `rateLimitInfo`). */
  public readonly extra?: Record<string, unknown>;

  constructor(statusCode: number, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.extra = extra;
    // Ensure the name shows up in logs correctly
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// ── Factory helpers ────────────────────────────────────────

export function badRequest(message: string, extra?: Record<string, unknown>): AppError {
  return new AppError(400, message, extra);
}

export function notFound(message?: string): AppError {
  return new AppError(404, message ?? 'Resource not found');
}

export function tooManyRequests(message: string, extra?: Record<string, unknown>): AppError {
  return new AppError(429, message, extra);
}

export function internalError(message?: string): AppError {
  return new AppError(500, message ?? 'Internal server error');
}

// ── asyncRoute wrapper ─────────────────────────────────────

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<any> | void;

/**
 * Wraps an async route handler so that any thrown Error (or rejected promise)
 * is forwarded to `next()`.  This lets you write route handlers without a
 * try/catch block — errors flow to the centralized error-handling middleware.
 */
export function asyncRoute(fn: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
