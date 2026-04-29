import React from 'react';
import { 
  BaseError, 
  ErrorFactory, 
  ErrorUtils, 
  ErrorCategory,
  ErrorSeverity,
  ErrorContext 
} from '../../../shared/src/errors/standardError';

/**
 * Standardized error handling utilities for frontend
 */

export interface ClientErrorContext extends ErrorContext {
  component?: string;
  action?: string;
  userAgent?: string;
  url?: string;
  timestamp?: string;
}

/**
 * Frontend error handler class
 */
export class FrontendErrorHandler {
  private static instance: FrontendErrorHandler;
  private errorQueue: BaseError[] = [];
  private maxQueueSize = 100;

  static getInstance(): FrontendErrorHandler {
    if (!FrontendErrorHandler.instance) {
      FrontendErrorHandler.instance = new FrontendErrorHandler();
    }
    return FrontendErrorHandler.instance;
  }

  /**
   * Handle and log frontend errors
   */
  handleError(
    error: Error | BaseError,
    context: ClientErrorContext = {}
  ): BaseError {
    let standardError: BaseError;

    if (error instanceof BaseError) {
      standardError = error;
    } else {
      standardError = ErrorFactory.wrap(error, ErrorCategory.SYSTEM, {
        ...context,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString()
      });
    }

    // Add to queue for batch reporting
    this.addToQueue(standardError);

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[FrontendErrorHandler]', standardError.toStandardError());
    }

    // Report to server
    void this.reportError(standardError);

    return standardError;
  }

  /**
   * Handle React component errors
   */
  handleComponentError(
    error: Error,
    errorInfo: React.ErrorInfo,
    component: string
  ): BaseError {
    return this.handleError(error, {
      component,
      action: 'render',
      componentStack: errorInfo.componentStack,
      source: 'react-component'
    });
  }

  /**
   * Handle API errors
   */
  handleApiError(
    error: Error,
    endpoint: string,
    method: string,
    context: Partial<ClientErrorContext> = {}
  ): BaseError {
    const category = this.categorizeApiError(error);
    
    return this.handleError(error, {
      ...context,
      component: 'api-client',
      action: `${method} ${endpoint}`,
      metadata: {
        ...context.metadata,
        endpoint,
        method,
        status: (error as any).status,
        statusText: (error as any).statusText
      }
    });
  }

  /**
   * Handle form validation errors
   */
  handleValidationError(
    message: string,
    fieldName: string,
    value: any,
    context: Partial<ClientErrorContext> = {}
  ): BaseError {
    return this.handleError(new Error(message), {
      ...context,
      component: 'form-validation',
      action: 'validate',
      metadata: {
        fieldName,
        value: typeof value === 'string' ? value.substring(0, 100) : value
      }
    });
  }

  /**
   * Handle user action errors
   */
  handleUserActionError(
    error: Error,
    action: string,
    context: Partial<ClientErrorContext> = {}
  ): BaseError {
    return this.handleError(error, {
      ...context,
      component: 'user-action',
      action,
      source: 'user-interaction'
    });
  }

  /**
   * Categorize API errors based on response
   */
  private categorizeApiError(error: Error): ErrorCategory {
    const httpError = error as any;
    
    if (httpError.status) {
      switch (httpError.status) {
        case 400:
        case 422:
          return ErrorCategory.VALIDATION;
        case 401:
          return ErrorCategory.AUTHENTICATION;
        case 403:
          return ErrorCategory.AUTHORIZATION;
        case 429:
          return ErrorCategory.RATE_LIMIT;
        case 500:
        case 502:
        case 503:
          return ErrorCategory.SYSTEM;
        default:
          return ErrorCategory.EXTERNAL_SERVICE;
      }
    }

    if (error.name === 'NetworkError' || error.message.includes('fetch')) {
      return ErrorCategory.NETWORK;
    }

    return ErrorCategory.SYSTEM;
  }

  /**
   * Add error to queue for batch reporting
   */
  private addToQueue(error: BaseError): void {
    this.errorQueue.push(error);
    
    // Maintain queue size
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue = this.errorQueue.slice(-this.maxQueueSize);
    }
  }

  /**
   * Report error to server
   */
  private async reportError(error: BaseError): Promise<void> {
    try {
      const payload = {
        ...error.toStandardError(),
        source: 'frontend',
        userAgent: navigator.userAgent,
        url: window.location.href
      };

      await fetch('/api/client-errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } catch (reportingError) {
      // Silently fail to avoid infinite error loops
      console.warn('[FrontendErrorHandler] Failed to report error:', reportingError);
    }
  }

  /**
   * Get queued errors
   */
  getQueuedErrors(): BaseError[] {
    return [...this.errorQueue];
  }

  /**
   * Clear error queue
   */
  clearQueue(): void {
    this.errorQueue = [];
  }
}

/**
 * Higher-order component for error boundaries
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: {
    fallback?: React.ReactNode;
    onError?: (error: BaseError) => void;
  } = {}
) {
  return class ErrorBoundaryWrapper extends React.Component<
    P,
    { hasError: boolean; error?: BaseError }
  > {
    constructor(props: P) {
      super(props);
      this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error) {
      return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
      const errorHandler = FrontendErrorHandler.getInstance();
      const standardError = errorHandler.handleComponentError(
        error,
        errorInfo,
        WrappedComponent.displayName || WrappedComponent.name || 'Unknown'
      );

      this.setState({ error: standardError });
      options.onError?.(standardError);
    }

    render() {
      if (this.state.hasError) {
        return options.fallback || <DefaultErrorFallback error={this.state.error} />;
      }

      return React.createElement(WrappedComponent, this.props);
    }
  };
}

/**
 * Default error fallback component
 */
export function DefaultErrorFallback({ error }: { error?: BaseError }) {
  if (!error) {
    return (
      <div className="p-4 border border-red-200 rounded-lg bg-red-50 text-red-800">
        <h3 className="font-semibold mb-2">Something went wrong</h3>
        <p className="text-sm">An unexpected error occurred. Please try again.</p>
      </div>
    );
  }

  const userMessage = ErrorUtils.getUserFriendlyMessage(error);

  return (
    <div className="p-4 border border-red-200 rounded-lg bg-red-50 text-red-800">
      <h3 className="font-semibold mb-2">Error</h3>
      <p className="text-sm mb-3">{userMessage}</p>
      {process.env.NODE_ENV === 'development' && (
        <details className="text-xs">
          <summary className="cursor-pointer hover:text-red-600">Technical details</summary>
          <pre className="mt-2 p-2 bg-red-100 rounded overflow-auto">
            {error.stack}
          </pre>
        </details>
      )}
    </div>
  );
}

/**
 * Hook for error handling in functional components
 */
export function useErrorHandler() {
  const errorHandler = FrontendErrorHandler.getInstance();

  return {
    handleError: errorHandler.handleError.bind(errorHandler),
    handleApiError: errorHandler.handleApiError.bind(errorHandler),
    handleValidationError: errorHandler.handleValidationError.bind(errorHandler),
    handleUserActionError: errorHandler.handleUserActionError.bind(errorHandler),
    getQueuedErrors: errorHandler.getQueuedErrors.bind(errorHandler),
    clearQueue: errorHandler.clearQueue.bind(errorHandler)
  };
}

/**
 * API wrapper with error handling
 */
export async function apiCall<T>(
  url: string,
  options: RequestInit = {},
  context: Partial<ClientErrorContext> = {}
): Promise<T> {
  const errorHandler = FrontendErrorHandler.getInstance();

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      (error as any).status = response.status;
      (error as any).statusText = response.statusText;
      
      throw errorHandler.handleApiError(
        error,
        url,
        options.method || 'GET',
        context
      );
    }

    return await response.json() as T;
  } catch (error) {
    if (error instanceof BaseError) {
      throw error;
    }
    
    throw errorHandler.handleApiError(
      error as Error,
      url,
      options.method || 'GET',
      context
    );
  }
}

/**
 * Form validation helper
 */
export function createFormValidator<T extends Record<string, any>>(
  schema: Record<keyof T, (value: any) => string | null>
) {
  const errorHandler = FrontendErrorHandler.getInstance();

  return (data: T): { isValid: boolean; errors: Partial<Record<keyof T, string>> } => {
    const errors: Partial<Record<keyof T, string>> = {};

    for (const [field, validator] of Object.entries(schema)) {
      try {
        const error = validator(data[field]);
        if (error) {
          errors[field as keyof T] = error;
          errorHandler.handleValidationError(
            error,
            field as string,
            data[field],
            { metadata: { formData: data } }
          );
        }
      } catch (validationError) {
        errors[field as keyof T] = 'Validation failed';
        errorHandler.handleValidationError(
          'Validation failed',
          field as string,
          data[field],
          { metadata: { formData: data, originalError: validationError } }
        );
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  };
}

// Export singleton instance
export const errorHandler = FrontendErrorHandler.getInstance();
