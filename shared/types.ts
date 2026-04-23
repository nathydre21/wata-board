/**
 * Shared Types for Wata-Board System
 * Standardized data formats across frontend, backend, and shared components
 */

// Network Configuration Types
export type NetworkType = 'testnet' | 'mainnet';

export interface NetworkConfig {
  networkPassphrase: string;
  contractId: string;
  rpcUrl: string;
  explorerUrl: string;
}

export const NETWORKS: Record<NetworkType, NetworkConfig> = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA",
    rpcUrl: "https://soroban-testnet.stellar.org",
    explorerUrl: "https://stellar.expert/explorer/testnet/tx/",
  },
  mainnet: {
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    contractId: "MAINNET_CONTRACT_ID_HERE", // Replace with actual mainnet contract ID
    rpcUrl: "https://soroban.stellar.org",
    explorerUrl: "https://stellar.expert/explorer/public/tx/",
  },
};

// Payment Types
export interface PaymentRequest {
  meterId: string; // Standardized to camelCase
  amount: number;
  userId: string;
  timestamp?: string; // ISO string for consistency
}

export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  error?: string;
  timestamp: string; // ISO string for consistency
  rateLimitInfo?: RateLimitInfo;
}

export interface RateLimitInfo {
  remainingRequests?: number;
  resetTime?: string; // ISO string for consistency
  queued?: boolean;
  queuePosition?: number;
  allowed?: boolean;
  limit?: number;
}

export interface RateLimitStatus {
  success: boolean;
  data?: {
    remainingRequests: number;
    resetTime: string; // ISO string for consistency
    allowed: boolean;
    queued: boolean;
    queuePosition?: number;
    queueLength: number;
    limit: number;
  };
  error?: string;
}

// User Tier Types
export enum UserTier {
  ANONYMOUS = 'anonymous',
  VERIFIED = 'verified',
  PREMIUM = 'premium',
  ADMIN = 'admin',
}

export interface TierRateLimitConfig {
  windowMs: number;
  maxRequests: number;
  queueSize: number;
}

export interface UserTierInfo {
  userId: string;
  tier: UserTier;
  walletAddress?: string;
  verifiedAt?: string; // ISO string for consistency
  premiumExpiresAt?: string; // ISO string for consistency
}

export interface TierRateLimitStatus {
  tier: UserTier;
  allowed: boolean;
  remainingRequests: number;
  resetTime: string; // ISO string for consistency
  queued: boolean;
  queuePosition?: number;
  limit: number;
}

// Payment Scheduling Types
export enum PaymentFrequency {
  ONCE = 'once',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly'
}

export enum PaymentStatus {
  PENDING = 'pending',
  SCHEDULED = 'scheduled',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PAUSED = 'paused'
}

export interface PaymentSchedule {
  id: string;
  userId: string;
  meterId: string;
  amount: number;
  frequency: PaymentFrequency;
  startDate: string; // ISO string for consistency
  endDate?: string; // ISO string for consistency
  nextPaymentDate: string; // ISO string for consistency
  status: PaymentStatus;
  description?: string;
  maxPayments?: number;
  currentPaymentCount: number;
  createdAt: string; // ISO string for consistency
  updatedAt: string; // ISO string for consistency
  notificationSettings: NotificationSettings;
  paymentHistory: ScheduledPayment[];
}

export interface ScheduledPayment {
  id: string;
  scheduleId: string;
  amount: number;
  scheduledDate: string; // ISO string for consistency
  actualPaymentDate?: string; // ISO string for consistency
  status: PaymentStatus;
  transactionId?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: string; // ISO string for consistency
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  sms: boolean;
  reminderDays: number[];
  successNotification: boolean;
  failureNotification: boolean;
}

// Receipt Types
export interface Receipt {
  id: string;
  paymentId: string;
  meterId: string;
  amount: number;
  currency: string;
  date: string; // ISO string for consistency
  transactionHash?: string;
  receiptNumber: string;
  billPeriod?: {
    start: string; // ISO string for consistency
    end: string; // ISO string for consistency
  };
  payerName?: string;
  payerAddress?: string;
  providerName: string;
  providerLogo?: string;
  qrCode?: string; // Base64 encoded QR code image
  status: 'pending' | 'generated' | 'viewed' | 'downloaded';
  notes?: string;
}

export interface ReceiptData {
  receiptNumber: string;
  date: string; // ISO string for consistency
  transactionId: string;
  meterId: string;
  meterType: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  walletAddress?: string;
  blockchainHash?: string;
  notes?: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string; // ISO string for consistency
}

export interface PaymentInfo {
  success: boolean;
  data?: {
    meterId: string;
    totalPaid: number;
    network: string;
    lastPaymentDate?: string; // ISO string for consistency
  };
  error?: string;
}

export interface HealthStatus {
  status: string;
  timestamp: string; // ISO string for consistency
  version: string;
  environment: string;
  uptime?: number;
}

// Utility Functions
export function getNetworkConfig(network: NetworkType): NetworkConfig {
  return NETWORKS[network];
}

export function getNetworkFromEnv(): NetworkType {
  // For frontend (Vite): import.meta.env.VITE_NETWORK
  // For backend (Node.js): process.env.NETWORK
  if (typeof window !== 'undefined' && (window as any).__VITE_ENV__) {
    // Frontend environment
    const network = (window as any).__VITE_ENV__.VITE_NETWORK;
    return network === 'mainnet' ? 'mainnet' : 'testnet';
  } else if (typeof window === 'undefined' && typeof globalThis !== 'undefined') {
    // Backend environment - check for process
    try {
      // Use dynamic import to avoid TypeScript errors
      const processModule = eval('require')('process');
      const network = processModule?.env?.NETWORK;
      return network === 'mainnet' ? 'mainnet' : 'testnet';
    } catch {
      // Fallback if process is not available
    }
  }
  
  // Default to testnet
  return 'testnet';
}

export function getCurrentNetworkConfig(): NetworkConfig {
  const network = getNetworkFromEnv();
  return getNetworkConfig(network);
}

export function isValidNetwork(network: string): network is NetworkType {
  return network === 'testnet' || network === 'mainnet';
}

// Date utility functions
export function toISOString(date: Date | string): string {
  if (typeof date === 'string') {
    return new Date(date).toISOString();
  }
  return date.toISOString();
}

export function fromDateISOString(isoString: string): Date {
  return new Date(isoString);
}

// Validation utilities
export function isValidPaymentRequest(request: PaymentRequest): string[] {
  const errors: string[] = [];

  if (!request.meterId || request.meterId.trim().length === 0) {
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
}

export function createApiResponse<T>(
  success: boolean,
  data?: T,
  error?: string
): ApiResponse<T> {
  return {
    success,
    data,
    error,
    timestamp: new Date().toISOString(),
  };
}
