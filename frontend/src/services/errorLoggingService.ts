export interface ClientErrorPayload {
  message: string;
  stack?: string;
  componentStack?: string;
  source?: string;
  url?: string;
  userAgent?: string;
  extra?: Record<string, unknown>;
}

const DEFAULT_LOG_ENDPOINT = '/api/client-errors';

export async function logClientError(
  error: Error,
  componentStack?: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const payload: ClientErrorPayload = {
    message: error.message,
    stack: error.stack,
    componentStack,
    source: 'frontend',
    url: window.location.href,
    userAgent: navigator.userAgent,
    extra
  };

  try {
    await fetch(DEFAULT_LOG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (loggingError) {
    // Avoid failing the application when reporting fails.
    console.warn('[ErrorLoggingService] Failed to report client-side error', loggingError);
  }
}
