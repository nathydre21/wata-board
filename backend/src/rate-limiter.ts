import logger from './utils/logger';

export interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  queueSize?: number;    // Max queue size for overflow requests
}

export interface RateLimitResult {
  allowed: boolean;
  remainingRequests: number;
  resetTime: Date;
  queued?: boolean;
  queuePosition?: number;
}

export function toRateLimitInfo(
  result: RateLimitResult,
  limit?: number,
): import('../../shared/types').RateLimitInfo {
  return {
    remainingRequests: result.remainingRequests,
    resetTime: result.resetTime?.toISOString(),
    queued: result.queued,
    queuePosition: result.queuePosition,
    allowed: result.allowed,
    limit,
  };
}

export interface QueuedRequest {
  id: string;
  timestamp: Date;
  resolve: (value: RateLimitResult) => void;
  reject: (error: Error) => void;
}

export class RateLimiter {
  private userRequests: Map<string, number[]> = new Map();
  private requestQueue: Map<string, QueuedRequest[]> = new Map();
  private queueIntervals: Map<string, NodeJS.Timeout> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = {
      queueSize: 10,
      ...config,
    };
  }

  /**
   * Check if a user can make a request based on rate limiting
   */
  async checkLimit(userId: string): Promise<RateLimitResult> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.config.windowMs);
    
    // Clean old requests
    this.cleanOldRequests(userId, windowStart);
    
    const userRequestTimes = this.userRequests.get(userId) || [];
    const currentCount = userRequestTimes.length;
    
    if (currentCount < this.config.maxRequests) {
      // Allow request
      logger.debug('Rate limit check: Allowed', { userId, count: currentCount + 1 });
      userRequestTimes.push(now.getTime());
      this.userRequests.set(userId, userRequestTimes);
      
      return {
        allowed: true,
        remainingRequests: this.config.maxRequests - currentCount - 1,
        resetTime: new Date(now.getTime() + this.config.windowMs),
        queued: false
      };
    }
    
    // Reject immediately when queueing is disabled
    if ((this.config.queueSize ?? 0) === 0) {
      const userRequestTimes = this.userRequests.get(userId) || [];
      const oldestRequest = userRequestTimes.length > 0
        ? Math.min(...userRequestTimes)
        : now.getTime();

      return {
        allowed: false,
        remainingRequests: 0,
        resetTime: new Date(oldestRequest + this.config.windowMs),
        queued: false,
      };
    }

    // Check if we can queue this request
    return this.handleQueueing(userId, now);
  }

  /**
   * Handle request queueing when rate limit is exceeded
   */
  private async handleQueueing(userId: string, now: Date): Promise<RateLimitResult> {
    const userQueue = this.requestQueue.get(userId) || [];
    
    if (userQueue.length >= (this.config.queueSize ?? 10)) {
      // Queue is full, reject request
      const userRequestTimes = this.userRequests.get(userId) || [];
      const oldestRequest = Math.min(...userRequestTimes);
      
      return {
        allowed: false,
        remainingRequests: 0,
        resetTime: new Date(oldestRequest + this.config.windowMs),
        queued: false
      };
    }
    
    // Add to queue
    return new Promise((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: now,
        resolve,
        reject
      };
      
      userQueue.push(queuedRequest);
      this.requestQueue.set(userId, userQueue);
      
      // Set up queue processing
      this.processQueue(userId);
      
      // Return immediate response
      resolve({
        allowed: false,
        remainingRequests: 0,
        resetTime: new Date(now.getTime() + this.config.windowMs),
        queued: true,
        queuePosition: userQueue.length
      });
    });
  }

  /**
   * Process queued requests when rate limit window expires
   */
  private processQueue(userId: string): void {
    if (this.queueIntervals.has(userId)) return;

    const userQueue = this.requestQueue.get(userId);
    if (!userQueue || userQueue.length === 0) return;
    
    const processInterval = setInterval(() => {
      const queue = this.requestQueue.get(userId);
      if (!queue || queue.length === 0) {
        clearInterval(processInterval);
        this.queueIntervals.delete(userId);
        this.requestQueue.delete(userId);
        return;
      }

      const now = new Date();
      const windowStart = new Date(now.getTime() - this.config.windowMs);
      
      this.cleanOldRequests(userId, windowStart);
      
      const userRequestTimes = this.userRequests.get(userId) || [];
      const currentCount = userRequestTimes.length;
      
      if (currentCount < this.config.maxRequests && queue.length > 0) {
        const nextRequest = queue.shift();
        if (nextRequest) {
          logger.info('Rate limit queue: Processing next request', { userId, requestId: nextRequest.id });
          userRequestTimes.push(now.getTime());
          this.userRequests.set(userId, userRequestTimes);
          
          nextRequest.resolve({
            allowed: true,
            remainingRequests: this.config.maxRequests - currentCount - 1,
            resetTime: new Date(now.getTime() + this.config.windowMs),
            queued: false
          });
          
          this.requestQueue.set(userId, queue);
        }
      }
      
      if (queue.length === 0) {
        clearInterval(processInterval);
        this.queueIntervals.delete(userId);
        this.requestQueue.delete(userId);
      }
    }, 1000);

    if (typeof processInterval.unref === 'function') {
      processInterval.unref();
    }
    this.queueIntervals.set(userId, processInterval);
  }

  /**
   * Clean old requests outside the time window
   */
  private cleanOldRequests(userId: string, windowStart: Date): void {
    const userRequestTimes = this.userRequests.get(userId);
    if (!userRequestTimes) return;
    
    const validRequests = userRequestTimes.filter(time => time >= windowStart.getTime());
    this.userRequests.set(userId, validRequests);
  }

  /**
   * Get current rate limit status for a user
   */
  getStatus(userId: string): RateLimitResult {
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.config.windowMs);
    
    this.cleanOldRequests(userId, windowStart);
    
    const userRequestTimes = this.userRequests.get(userId) || [];
    const currentCount = userRequestTimes.length;
    const oldestRequest = userRequestTimes.length > 0 ? Math.min(...userRequestTimes) : now.getTime();
    
    return {
      allowed: currentCount < this.config.maxRequests,
      remainingRequests: Math.max(0, this.config.maxRequests - currentCount),
      resetTime: new Date(oldestRequest + this.config.windowMs),
      queued: false
    };
  }

  /**
   * Reset rate limit for a specific user (admin function)
   */
  resetUser(userId: string): void {
    const interval = this.queueIntervals.get(userId);
    if (interval) {
      clearInterval(interval);
      this.queueIntervals.delete(userId);
    }
    this.userRequests.delete(userId);
    this.requestQueue.delete(userId);
  }

  /**
   * Get queue length for a user
   */
  getQueueLength(userId: string): number {
    return this.requestQueue.get(userId)?.length || 0;
  }
}
