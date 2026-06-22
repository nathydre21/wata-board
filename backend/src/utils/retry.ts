import logger from './logger';

/**
 * Error thrown when all retry attempts are exhausted or a non-retryable error occurs.
 * Carries the retry metadata so callers can report accurate retry counts.
 */
export class RetryError extends Error {
  public readonly cause: Error;
  public readonly attempts: number;
  public readonly retries: number;

  constructor(message: string, cause: Error, attempts: number, retries: number) {
    super(message);
    this.name = 'RetryError';
    this.cause = cause;
    this.attempts = attempts;
    this.retries = retries;
  }
}

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds before first retry (default: 1000ms) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds between retries (default: 30000ms) */
  maxDelayMs?: number;
  /** Optional predicate to determine if an error is retryable.
   *  If omitted, all errors are considered retryable. */
  retryableError?: (error: Error) => boolean;
  /** Optional context label for logging */
  context?: string;
}

export interface RetryResult<T> {
  result: T;
  attempts: number;
  retries: number;
}

/**
 * Default error predicate: retry on network/timeout errors, not on validation errors.
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message?.toLowerCase() || '';
  const nonRetryable = [
    'invalid meter id',
    'invalid amount',
    'invalid user id',
    'kyc verification required',
    'transaction flagged',
    'not available',
    'rate limit exceeded',
    'rate limiter not configured',
    'invalid field types',
    'missing required fields',
  ];

  // Explicitly non-retryable errors
  if (nonRetryable.some((pattern) => message.includes(pattern))) {
    return false;
  }

  // Retryable categories
  const retryable = [
    'network',
    'timeout',
    'connection',
    'econnrefused',
    'etimedout',
    'econnreset',
    'enotfound',
    'contract execution failed',
    'temporarily unavailable',
    'service unavailable',
    'internal server error',
    'too many requests',
    '503',
    '502',
    '504',
  ];

  return retryable.some((pattern) => message.includes(pattern));
}

/**
 * Compute delay with exponential backoff and full jitter.
 * In test environments, returns 0 to avoid slowing down tests.
 * Formula: min(maxDelay, baseDelay * 2^retry) * random[0, 1]
 */
function computeDelay(baseDelayMs: number, retry: number, maxDelayMs: number): number {
  // In test environments, skip delays so tests don't wait for retries
  if (process.env.NODE_ENV === 'test') {
    return 0;
  }
  const exponentialDelay = baseDelayMs * Math.pow(2, retry);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  // Full jitter: random value between 0 and cappedDelay
  return Math.random() * cappedDelay;
}

/**
 * Execute a function with retry logic using exponential backoff with jitter.
 *
 * @param fn - The async function to execute with retry
 * @param options - Retry configuration options
 * @returns The result of the function along with attempt and retry counts
 */
export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<RetryResult<T>> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    retryableError = isRetryableError,
    context = 'retry',
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await fn(attempt);
      return { result, attempts: attempt, retries: attempt - 1 };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const currentRetries = attempt - 1;

      // If this was the last attempt, throw RetryError
      if (attempt > maxRetries) {
        logger.warn(`[${context}] All ${attempt} attempts exhausted`, {
          error: lastError.message,
          attempts: attempt,
        });
        throw new RetryError(
          `${context}: all ${attempt} attempts exhausted - ${lastError.message}`,
          lastError,
          attempt,
          currentRetries,
        );
      }

      // Check if error is retryable
      if (!retryableError(lastError)) {
        logger.warn(`[${context}] Non-retryable error, not retrying`, {
          error: lastError.message,
          attempt,
        });
        throw new RetryError(
          `${context}: non-retryable error on attempt ${attempt} - ${lastError.message}`,
          lastError,
          attempt,
          currentRetries,
        );
      }

      const delay = computeDelay(baseDelayMs, attempt - 1, maxDelayMs);
      logger.info(`[${context}] Retry attempt ${attempt}/${maxRetries + 1} after ${Math.round(delay)}ms`, {
        error: lastError.message,
        attempt,
        delay: Math.round(delay),
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Should not reach here, but TypeScript needs it
  throw new RetryError(
    `${context}: unknown retry error`,
    lastError || new Error('Unknown retry error'),
    0,
    0,
  );
}
