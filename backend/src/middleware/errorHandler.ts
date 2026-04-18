import express from 'express';
import logger from '../utils/logger';

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
  const payload = req.body as ClientErrorRequestBody;

  logger.error('Client error reported', {
    ...payload,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  res.status(202).json({ success: true, message: 'Client error logged' });
};

export const apiErrorHandler: express.ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err?.name === 'UnauthorizedError') {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (err?.message === 'Not allowed by CORS') {
    return res.status(403).json({ success: false, error: 'CORS policy violation' });
  }

  logger.error('Unhandled server error', {
    message: err?.message,
    stack: err?.stack,
    path: req.path,
    method: req.method,
    body: req.body
  });

  res.status(500).json({ success: false, error: 'Internal server error' });
};
