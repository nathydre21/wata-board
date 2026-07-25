import express from 'express';
import logger from '../utils/logger';
import { captureException } from '../utils/errorTracker';
import { sanitizeString, sanitizeUrl, sanitizeDescription } from '../utils/sanitize';
import { AppError } from '../utils/asyncRouteHandler';

export interface ClientErrorRequestBody {
  message: string;
  stack?: string;
  componentStack?: string;
  source?: string;
  url?: string;
  userAgent?: string;
  extra?: Record<string, unknown>;
}

export const handleClientError = (req: express.Request, res: express.Response) => {
  const raw = req.body;

  // Sanitize every field before logging to prevent log injection
  const payload: ClientErrorRequestBody = {
    message: sanitizeDescription(raw.message, 1000),
    stack: sanitizeDescription(raw.stack, 5000),
    componentStack: sanitizeDescription(raw.componentStack, 5000),
    source: sanitizeString(raw.source, 100),
    url: sanitizeUrl(raw.url),
    userAgent: sanitizeString(raw.userAgent, 300),
    // Only allow plain scalar values in extra to prevent prototype pollution
    extra: typeof raw.extra === 'object' && raw.extra !== null
      ? Object.fromEntries(
          Object.entries(raw.extra as Record<string, unknown>)
            .filter(([, v]) => typeof v !== 'object')
            .slice(0, 20)
        )
      : undefined,
  };

  logger.error('Client error reported', {
    ...payload,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  void captureException(new Error(payload.message), {
    source: 'client-error',
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    url: payload.url,
  });

  res.status(202).json({ success: true, message: 'Client error logged' });
};

/**
 * Centralized error-handling middleware.
 *
 * Handles:
 * - AppError instances — use the embedded statusCode and extra payload.
 * - UnauthorizedError (from express-jwt / similar).
 * - CORS errors.
 * - Everything else → 500 Internal Server Error.
 *
 * All responses follow the standardized shape:
 *   { success: false, error: "<message>", requestId?: "<uuid>" }
 */
export const apiErrorHandler: express.ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const requestId = (req as any).requestId as string | undefined;

  // ── Known error types ────────────────────────────────────

  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      success: false,
      error: err.message,
    };
    if (requestId) body.requestId = requestId;
    // Merge extra fields (e.g. errors[], rateLimitInfo, providerId)
    if (err.extra) {
      for (const [key, value] of Object.entries(err.extra)) {
        body[key] = value;
      }
    }
    return res.status(err.statusCode).json(body);
  }

  if (err?.name === 'UnauthorizedError') {
    return res.status(401).json({ success: false, error: 'Unauthorized', requestId });
  }

  if (err?.message === 'Not allowed by CORS') {
    return res.status(403).json({ success: false, error: 'CORS policy violation', requestId });
  }

  // ── Unhandled errors (500) ───────────────────────────────

  logger.error('Unhandled server error', {
    message: err?.message,
    stack: err?.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    requestId,
  });

  void captureException(err, {
    source: 'server-error',
    path: req.path,
    method: req.method,
    body: req.body,
    requestId,
  });

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    ...(requestId ? { requestId } : {}),
  });
};
