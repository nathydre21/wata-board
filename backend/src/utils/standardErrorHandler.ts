import express from 'express';
import { 
  BaseError, 
  ErrorFactory, 
  ErrorUtils, 
  StandardError,
  ErrorCategory,
  ErrorSeverity 
} from '../../../shared/src/errors/standardError';
import logger from './logger';
import { captureException } from './errorTracker';

/**
 * Standardized error handler for Express applications
 */
export class StandardErrorHandler {
  /**
   * Express error handling middleware
   */
  static handle(): express.ErrorRequestHandler {
    return (err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      // Don't handle if headers already sent
      if (res.headersSent) {
        return next(err);
      }

      let standardError: BaseError;

      // Convert existing error to standard format
      if (err instanceof BaseError) {
        standardError = err;
      } else {
        standardError = ErrorFactory.wrap(err, ErrorCategory.SYSTEM, {
          requestId: req.headers['x-request-id'] as string,
          userId: (req as any).user?.id,
          component: 'express-middleware',
          action: `${req.method} ${req.path}`,
          metadata: {
            userAgent: req.get('user-agent'),
            ip: req.ip,
            body: req.body
          }
        });
      }

      // Log the error
      this.logError(standardError, req);

      // Send error response
      this.sendErrorResponse(standardError, res);
    };
  }

  /**
   * Handle async route errors
   */
  static asyncHandler(
    fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<any>
  ) {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Create standardized error response
   */
  static createErrorResponse(error: BaseError, status: number = 500) {
    return {
      success: false,
      error: error.toJSON(),
      status,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Log error with context
   */
  private static logError(error: BaseError, req: express.Request) {
    const logData = {
      error: error.toStandardError(),
      request: {
        method: req.method,
        path: req.path,
        headers: req.headers,
        body: req.body,
        query: req.query,
        params: req.params,
        ip: req.ip,
        userAgent: req.get('user-agent')
      }
    };

    // Choose log level based on severity
    switch (error.severity) {
      case ErrorSeverity.LOW:
        logger.info('Application error', logData);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn('Application warning', logData);
        break;
      case ErrorSeverity.HIGH:
        logger.error('Application error', logData);
        break;
      case ErrorSeverity.CRITICAL:
        logger.error('Critical application error', logData);
        break;
    }

    // Send to external error tracking
    void captureException(error, {
      requestId: error.context?.requestId,
      path: req.path,
      method: req.method,
      userId: error.context?.userId
    });
  }

  /**
   * Send appropriate HTTP response based on error
   */
  private static sendErrorResponse(error: BaseError, res: express.Response) {
    const statusCode = this.getStatusCode(error);
    const response = this.createErrorResponse(error, statusCode);

    // Add rate limit headers if applicable
    if (error instanceof RateLimitError) {
      if (error.retryAfter) {
        res.set('Retry-After', error.retryAfter.toString());
      }
      if (error.resetTime) {
        res.set('X-RateLimit-Reset', Math.ceil(error.resetTime.getTime() / 1000).toString());
      }
    }

    res.status(statusCode).json(response);
  }

  /**
   * Map error category to HTTP status code
   */
  private static getStatusCode(error: BaseError): number {
    switch (error.category) {
      case ErrorCategory.VALIDATION:
      case ErrorCategory.USER_INPUT:
        return 400;
      case ErrorCategory.AUTHENTICATION:
        return 401;
      case ErrorCategory.AUTHORIZATION:
        return 403;
      case ErrorCategory.RATE_LIMIT:
        return 429;
      case ErrorCategory.NETWORK:
      case ErrorCategory.EXTERNAL_SERVICE:
        return 502;
      case ErrorCategory.DATABASE:
        return 503;
      case ErrorCategory.BUSINESS_LOGIC:
        return 422;
      case ErrorCategory.SYSTEM:
      default:
        return 500;
    }
  }
}

/**
 * Utility functions for common error scenarios
 */
export class ErrorHandlerUtils {
  /**
   * Handle validation errors
   */
  static handleValidationError(message: string, context?: any): never {
    throw new ValidationError(message, context);
  }

  /**
   * Handle authentication errors
   */
  static handleAuthError(message?: string, context?: any): never {
    throw new AuthenticationError(message, context);
  }

  /**
   * Handle authorization errors
   */
  static handleAuthzError(message?: string, context?: any): never {
    throw new AuthorizationError(message, context);
  }

  /**
   * Handle rate limit errors
   */
  static handleRateLimitError(
    message: string,
    resetTime?: Date,
    retryAfter?: number,
    context?: any
  ): never {
    throw new RateLimitError(message, resetTime, retryAfter, context);
  }

  /**
   * Handle database errors
   */
  static handleDatabaseError(error: Error, context?: any): never {
    throw new DatabaseError(error.message, context);
  }

  /**
   * Handle network errors
   */
  static handleNetworkError(error: Error, context?: any): never {
    throw new NetworkError(error.message, context);
  }

  /**
   * Handle external service errors
   */
  static handleExternalServiceError(
    serviceName: string,
    error: Error,
    context?: any
  ): never {
    throw new ExternalServiceError(serviceName, error.message, error, context);
  }

  /**
   * Handle business logic errors
   */
  static handleBusinessError(message: string, context?: any): never {
    throw new BusinessLogicError(message, context);
  }
}

/**
 * Middleware for handling unhandled promise rejections
 */
export function handleUnhandledRejections() {
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    logger.error('Unhandled Promise Rejection', {
      reason,
      promise: promise.toString(),
      stack: reason instanceof Error ? reason.stack : undefined
    });

    // Convert to standard error and log
    const error = reason instanceof Error 
      ? ErrorFactory.wrap(reason, ErrorCategory.SYSTEM)
      : new SystemError(String(reason));

    void captureException(error, {
      source: 'unhandled-rejection'
    });
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', {
      message: error.message,
      stack: error.stack
    });

    const standardError = ErrorFactory.wrap(error, ErrorCategory.SYSTEM);
    void captureException(standardError, {
      source: 'uncaught-exception'
    });

    // Exit process after logging
    process.exit(1);
  });
}

/**
 * Request context middleware
 */
export function requestContextMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  // Add request ID if not present
  const requestId = req.headers['x-request-id'] as string || 
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  req.headers['x-request-id'] = requestId;
  res.set('x-request-id', requestId);

  next();
}
