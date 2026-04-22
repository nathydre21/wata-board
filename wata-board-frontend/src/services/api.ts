/**
 * API Service for Wata-Board Frontend
 * Handles all backend API calls with proper CORS support
 */

import React from 'react';
import {
  PaymentRequest as StandardPaymentRequest,
  PaymentResponse as StandardPaymentResponse,
  RateLimitInfo,
  PaymentInfo as StandardPaymentInfo,
  HealthStatus as StandardHealthStatus,
  ApiResponse,
  ApiError,
  getCurrentTimestamp,
  amountToString,
  amountToNumber,
  Network,
  Currency,
  isApiResponse,
  isApiError
} from '../../../shared/types';

// Legacy interfaces for backward compatibility - marked as deprecated
/** @deprecated Use StandardPaymentRequest from shared/types instead */
export interface PaymentRequest {
  meter_id: string;
  amount: number;
  userId: string;
}

/** @deprecated Use StandardPaymentResponse from shared/types instead */
export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  error?: string;
  rateLimitInfo?: {
    remainingRequests?: number;
    resetTime?: string;
    queued?: boolean;
    queuePosition?: number;
  };
}

/** @deprecated Use ApiResponse with RateLimitInfo from shared/types instead */
export interface RateLimitStatus {
  success: boolean;
  data?: {
    remainingRequests: number;
    resetTime: Date;
    allowed: boolean;
    queued: boolean;
    queuePosition?: number;
    queueLength: number;
  };
  error?: string;
}

/** @deprecated Use StandardPaymentInfo from shared/types instead */
export interface PaymentInfo {
  success: boolean;
  data?: {
    meterId: string;
    totalPaid: number;
    network: string;
  };
  error?: string;
}

/** @deprecated Use StandardHealthStatus from shared/types instead */
export interface HealthStatus {
  status: string;
  timestamp: string;
  version: string;
  environment: string;
}

// Conversion utilities
function convertLegacyToStandard(legacy: PaymentRequest): StandardPaymentRequest {
  return {
    meterId: legacy.meter_id,
    amount: amountToString(legacy.amount),
    userId: legacy.userId,
    currency: Currency.XLM,
    network: Network.TESTNET
  };
}

function convertStandardToLegacy(standard: StandardPaymentRequest): PaymentRequest {
  return {
    meter_id: standard.meterId,
    amount: amountToNumber(standard.amount),
    userId: standard.userId
  };
}

class ApiService {
  private baseURL: string;
  private isDevelopment: boolean;

  constructor() {
    // Use proxy in development, direct URL in production
    this.isDevelopment = import.meta.env.DEV;
    this.baseURL = this.isDevelopment ? '/api' : this.getProductionApiUrl();
  }

  private getProductionApiUrl(): string {
    // In production, use the configured API URL
    return import.meta.env.VITE_API_URL || 'https://your-api-domain.com';
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include', // Include cookies for CORS
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      // Handle CORS errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 403) {
          throw new Error('CORS policy violation. Check your domain configuration.');
        }
        
        if (response.status === 429) {
          throw new Error(errorData.error || 'Rate limit exceeded. Please try again later.');
        }
        
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network error. Unable to connect to the API server.');
      }
      throw error;
    }
  }

  /**
   * Process a utility payment (legacy interface)
   * @deprecated Use processStandardPayment instead
   */
  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    // Convert to standard format internally
    const standardRequest = convertLegacyToStandard(request);
    const result = await this.processStandardPayment(standardRequest);
    
    // Convert back to legacy format for backward compatibility
    return {
      success: result.success,
      transactionId: result.transactionId,
      error: result.error,
      rateLimitInfo: result.rateLimitInfo
    };
  }

  /**
   * Process a utility payment (standardized interface)
   */
  async processStandardPayment(request: StandardPaymentRequest): Promise<StandardPaymentResponse> {
    const response = await this.request<ApiResponse<StandardPaymentResponse>>('/payment', {
      method: 'POST',
      body: JSON.stringify(convertStandardToLegacy(request)),
    });

    if (isApiResponse(response)) {
      return response.data;
    } else {
      // Convert ApiError to PaymentResponse format
      return {
        success: false,
        error: response.error,
        timestamp: response.timestamp
      };
    }
  }

  /**
   * Get rate limit status for a user (legacy interface)
   * @deprecated Use getStandardRateLimitStatus instead
   */
  async getRateLimitStatus(userId: string): Promise<RateLimitStatus> {
    const response = await this.request<ApiResponse<any>>(`/rate-limit/${encodeURIComponent(userId)}`);
    
    if (isApiResponse(response)) {
      return {
        success: true,
        data: {
          ...response.data,
          resetTime: new Date(response.data.resetTime)
        }
      };
    } else {
      return {
        success: false,
        error: response.error
      };
    }
  }

  /**
   * Get rate limit status for a user (standardized interface)
   */
  async getStandardRateLimitStatus(userId: string): Promise<ApiResponse<RateLimitInfo>> {
    const response = await this.request<ApiResponse<RateLimitInfo>>(`/rate-limit/${encodeURIComponent(userId)}`);
    return response;
  }

  /**
   * Get payment information for a meter (legacy interface)
   * @deprecated Use getStandardPaymentInfo instead
   */
  async getPaymentInfo(meterId: string): Promise<PaymentInfo> {
    const response = await this.request<StandardPaymentInfo>(`/payment/${encodeURIComponent(meterId)}`);
    
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          meterId: response.data.meterId,
          totalPaid: amountToNumber(response.data.totalPaid),
          network: response.data.network
        }
      };
    } else {
      return {
        success: false,
        error: response.error
      };
    }
  }

  /**
   * Get payment information for a meter (standardized interface)
   */
  async getStandardPaymentInfo(meterId: string): Promise<StandardPaymentInfo> {
    return this.request<StandardPaymentInfo>(`/payment/${encodeURIComponent(meterId)}`);
  }

  /**
   * Check API health status (legacy interface)
   * @deprecated Use getStandardHealthStatus instead
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const response = await this.request<ApiResponse<StandardHealthStatus>>('/health');
    
    if (isApiResponse(response)) {
      return {
        status: response.data.status,
        timestamp: response.data.timestamp,
        version: response.data.version,
        environment: response.data.environment
      };
    } else {
      throw new Error(response.error);
    }
  }

  /**
   * Check API health status (standardized interface)
   */
  async getStandardHealthStatus(): Promise<ApiResponse<StandardHealthStatus>> {
    return this.request<ApiResponse<StandardHealthStatus>>('/health');
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getStandardHealthStatus();
      return true;
    } catch (error) {
      console.error('API connection test failed:', error);
      return false;
    }
  }
}

// Create singleton instance
export const apiService = new ApiService();

// Export types for convenience
export type { PaymentRequest, PaymentResponse, RateLimitStatus, PaymentInfo, HealthStatus };

// Utility functions for common operations
export const paymentUtils = {
  /**
   * Format payment amount for display
   */
  formatAmount: (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'XLM',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(amount);
  },

  /**
   * Validate payment request
   */
  validatePaymentRequest: (request: PaymentRequest): string[] => {
    const errors: string[] = [];

    if (!request.meter_id || request.meter_id.trim().length === 0) {
      errors.push('Meter ID is required');
    }

    if (!request.amount || request.amount <= 0) {
      errors.push('Amount must be greater than 0');
    }

    if (request.amount > 10000) {
      errors.push('Amount cannot exceed 10,000 XLM');
    }

    if (!request.userId || request.userId.trim().length === 0) {
      errors.push('User ID is required');
    }

    return errors;
  },

  /**
   * Get rate limit message for display
   */
  getRateLimitMessage: (rateLimitInfo?: PaymentResponse['rateLimitInfo']): string => {
    if (!rateLimitInfo) return '';

    if (rateLimitInfo.queued && rateLimitInfo.queuePosition) {
      return `Your payment is queued. Position: #${rateLimitInfo.queuePosition}`;
    }

    if (rateLimitInfo.remainingRequests !== undefined) {
      return `${rateLimitInfo.remainingRequests} requests remaining`;
    }

    return '';
  },

  /**
   * Check if payment is queued
   */
  isPaymentQueued: (response: PaymentResponse): boolean => {
    return !!(response.rateLimitInfo?.queued);
  },

  /**
   * Check if rate limited
   */
  isRateLimited: (response: PaymentResponse): boolean => {
    return !response.success && response.error?.includes('Rate limit exceeded');
  },
};

// React hooks for common operations
export const useApi = () => {
  const [isConnected, setIsConnected] = React.useState(false);
  const [isConnecting, setIsConnecting] = React.useState(false);

  React.useEffect(() => {
    const checkConnection = async () => {
      setIsConnecting(true);
      try {
        const connected = await apiService.testConnection();
        setIsConnected(connected);
      } catch (error) {
        setIsConnected(false);
      } finally {
        setIsConnecting(false);
      }
    };

    checkConnection();
    
    // Check connection every 30 seconds
    const interval = setInterval(checkConnection, 30000);
    
    return () => clearInterval(interval);
  }, []);

  return {
    isConnected,
    isConnecting,
    apiService,
    paymentUtils,
  };
};

export default apiService;
