/**
 * Standardized error handling patterns for the wata-board application
 * Provides consistent error types, handling, and reporting across all components
 */

export enum ErrorCategory {
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  NETWORK = 'NETWORK',
  DATABASE = 'DATABASE',
  BUSINESS_LOGIC = 'BUSINESS_LOGIC',
  RATE_LIMIT = 'RATE_LIMIT',
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE',
  SYSTEM = 'SYSTEM',
  USER_INPUT = 'USER_INPUT'
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface StandardError {
  code: string;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  timestamp: string;
  context?: Record<string, unknown>;
  stack?: string;
  userId?: string;
  requestId?: string;
}

export interface ErrorContext {
  userId?: string;
  requestId?: string;
  component?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Base class for standardized errors
 */
export abstract class BaseError extends Error {
  public readonly code: string;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly timestamp: string;
  public readonly context?: ErrorContext;

  constructor(
    code: string,
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context?: ErrorContext
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.category = category;
    this.severity = severity;
    this.timestamp = new Date().toISOString();
    this.context = context;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert to standardized error object
   */
  toStandardError(): StandardError {
    return {
      code: this.code,
      message: this.message,
      category: this.category,
      severity: this.severity,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack,
      userId: this.context?.userId,
      requestId: this.context?.requestId
    };
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON(): Omit<StandardError, 'stack'> {
    const standardError = this.toStandardError();
    // Remove stack trace from client-facing responses
    const { stack, ...clientError } = standardError;
    return clientError;
  }
}

/**
 * Validation errors for user input
 */
export class ValidationError extends BaseError {
  constructor(message: string, context?: ErrorContext) {
    super('VALIDATION_ERROR', message, ErrorCategory.VALIDATION, ErrorSeverity.LOW, context);
  }
}

/**
 * Authentication errors
 */
export class AuthenticationError extends BaseError {
  constructor(message: string = 'Authentication required', context?: ErrorContext) {
    super('AUTH_ERROR', message, ErrorCategory.AUTHENTICATION, ErrorSeverity.MEDIUM, context);
  }
}

/**
 * Authorization errors
 */
export class AuthorizationError extends BaseError {
  constructor(message: string = 'Access denied', context?: ErrorContext) {
    super('AUTHZ_ERROR', message, ErrorCategory.AUTHORIZATION, ErrorSeverity.MEDIUM, context);
  }
}

/**
 * Network-related errors
 */
export class NetworkError extends BaseError {
  constructor(message: string, context?: ErrorContext) {
    super('NETWORK_ERROR', message, ErrorCategory.NETWORK, ErrorSeverity.MEDIUM, context);
  }
}

/**
 * Database errors
 */
export class DatabaseError extends BaseError {
  constructor(message: string, context?: ErrorContext) {
    super('DB_ERROR', message, ErrorCategory.DATABASE, ErrorSeverity.HIGH, context);
  }
}

/**
 * Business logic errors
 */
export class BusinessLogicError extends BaseError {
  constructor(message: string, context?: ErrorContext) {
    super('BUSINESS_ERROR', message, ErrorCategory.BUSINESS_LOGIC, ErrorSeverity.MEDIUM, context);
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends BaseError {
  public readonly resetTime?: Date;
  public readonly retryAfter?: number;

  constructor(
    message: string,
    resetTime?: Date,
    retryAfter?: number,
    context?: ErrorContext
  ) {
    super('RATE_LIMIT_ERROR', message, ErrorCategory.RATE_LIMIT, ErrorSeverity.LOW, context);
    this.resetTime = resetTime;
    this.retryAfter = retryAfter;
  }

  toJSON(): Omit<StandardError, 'stack'> & { resetTime?: string; retryAfter?: number } {
    const base = super.toJSON();
    return {
      ...base,
      resetTime: this.resetTime?.toISOString(),
      retryAfter: this.retryAfter
    };
  }
}

/**
 * External service errors
 */
export class ExternalServiceError extends BaseError {
  public readonly serviceName: string;
  public readonly originalError?: Error;

  constructor(
    serviceName: string,
    message: string,
    originalError?: Error,
    context?: ErrorContext
  ) {
    super('EXTERNAL_SERVICE_ERROR', message, ErrorCategory.EXTERNAL_SERVICE, ErrorSeverity.HIGH, context);
    this.serviceName = serviceName;
    this.originalError = originalError;
  }

  toJSON(): Omit<StandardError, 'stack'> & { serviceName: string } {
    const base = super.toJSON();
    return {
      ...base,
      serviceName: this.serviceName
    };
  }
}

/**
 * System errors
 */
export class SystemError extends BaseError {
  constructor(message: string, context?: ErrorContext) {
    super('SYSTEM_ERROR', message, ErrorCategory.SYSTEM, ErrorSeverity.CRITICAL, context);
  }
}

/**
 * User input errors
 */
export class UserInputError extends BaseError {
  constructor(message: string, context?: ErrorContext) {
    super('USER_INPUT_ERROR', message, ErrorCategory.USER_INPUT, ErrorSeverity.LOW, context);
  }
}

/**
 * Error factory for creating standardized errors
 */
export class ErrorFactory {
  /**
   * Create error from category
   */
  static create(
    category: ErrorCategory,
    message: string,
    context?: ErrorContext,
    severity?: ErrorSeverity
  ): BaseError {
    switch (category) {
      case ErrorCategory.VALIDATION:
        return new ValidationError(message, context);
      case ErrorCategory.AUTHENTICATION:
        return new AuthenticationError(message, context);
      case ErrorCategory.AUTHORIZATION:
        return new AuthorizationError(message, context);
      case ErrorCategory.NETWORK:
        return new NetworkError(message, context);
      case ErrorCategory.DATABASE:
        return new DatabaseError(message, context);
      case ErrorCategory.BUSINESS_LOGIC:
        return new BusinessLogicError(message, context);
      case ErrorCategory.RATE_LIMIT:
        return new RateLimitError(message, context?.metadata?.resetTime as Date, context?.metadata?.retryAfter as number, context);
      case ErrorCategory.EXTERNAL_SERVICE:
        return new ExternalServiceError(context?.metadata?.serviceName as string || 'unknown', message, undefined, context);
      case ErrorCategory.SYSTEM:
        return new SystemError(message, context);
      case ErrorCategory.USER_INPUT:
        return new UserInputError(message, context);
      default:
        return new SystemError(message, context);
    }
  }

  /**
   * Wrap existing error in standardized format
   */
  static wrap(
    error: Error,
    category: ErrorCategory,
    context?: ErrorContext,
    severity?: ErrorSeverity
  ): BaseError {
    return this.create(category, error.message, context, severity);
  }
}

/**
 * Utility functions for error handling
 */
export class ErrorUtils {
  /**
   * Check if error is retryable
   */
  static isRetryable(error: BaseError): boolean {
    return [
      ErrorCategory.NETWORK,
      ErrorCategory.EXTERNAL_SERVICE,
      ErrorCategory.DATABASE
    ].includes(error.category);
  }

  /**
   * Get user-friendly message
   */
  static getUserFriendlyMessage(error: BaseError): string {
    switch (error.category) {
      case ErrorCategory.VALIDATION:
      case ErrorCategory.USER_INPUT:
        return `Please check your input: ${error.message}`;
      case ErrorCategory.AUTHENTICATION:
        return 'Please sign in to continue';
      case ErrorCategory.AUTHORIZATION:
        return 'You do not have permission to perform this action';
      case ErrorCategory.RATE_LIMIT:
        return error.message; // Rate limit errors are already user-friendly
      case ErrorCategory.NETWORK:
        return 'Connection issue. Please check your internet connection and try again';
      case ErrorCategory.EXTERNAL_SERVICE:
        return 'Service temporarily unavailable. Please try again later';
      case ErrorCategory.DATABASE:
        return 'Database issue. Please try again later';
      case ErrorCategory.SYSTEM:
        return 'System error. Please contact support if the issue persists';
      default:
        return 'An unexpected error occurred. Please try again';
    }
  }

  /**
   * Generate error code
   */
  static generateCode(category: ErrorCategory, action: string): string {
    const categoryPrefix = category.substring(0, 3).toUpperCase();
    const actionSuffix = action.replace(/[^A-Z0-9]/gi, '_').toUpperCase();
    return `${categoryPrefix}_${actionSuffix}`;
  }
}
