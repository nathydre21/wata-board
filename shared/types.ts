/**
 * Shared type definitions for Wata-Board project
 * Ensures consistent data formats across frontend, backend, and contracts
 */

// Re-export Stellar types for consistency
export type { u32, i32, u64, i64, u128, i128, u256, i256 } from "@stellar/stellar-sdk/contract";

/**
 * Standardized payment amount type
 * Uses number in TypeScript but validates as u32 (0 to 4,294,967,295)
 */
export type PaymentAmount = number;

/**
 * Validates that a number is a valid u32 payment amount
 */
export function validatePaymentAmount(amount: number): amount is PaymentAmount {
  return Number.isInteger(amount) && amount >= 0 && amount <= 0xFFFFFFFF;
}

/**
 * Converts a PaymentAmount to u32 for contract calls
 */
export function toU32(amount: PaymentAmount): number {
  if (!validatePaymentAmount(amount)) {
    throw new Error(`Invalid payment amount: ${amount}. Must be a non-negative integer <= 4,294,967,295`);
  }
  return amount;
}

/**
 * Standardized meter identifier format
 */
export type MeterId = string;

/**
 * Validates meter ID format
 */
export function validateMeterId(meterId: string): meterId is MeterId {
  return typeof meterId === 'string' && meterId.trim().length > 0;
}

/**
 * Standardized user identifier format
 */
export type UserId = string;

/**
 * Validates user ID format
 */
export function validateUserId(userId: string): userId is UserId {
  return typeof userId === 'string' && userId.trim().length > 0;
}

/**
 * Standardized timestamp format (ISO string)
 */
export type Timestamp = string;

/**
 * Creates a standardized timestamp
 */
export function createTimestamp(): Timestamp {
  return new Date().toISOString();
}

/**
 * Validates timestamp format
 */
export function validateTimestamp(timestamp: string): timestamp is Timestamp {
  const date = new Date(timestamp);
  return !isNaN(date.getTime());
}

/**
 * Standardized network configuration
 */
export interface NetworkConfig {
  networkPassphrase: string;
  contractId: string;
  rpcUrl: string;
  networkType: 'testnet' | 'mainnet';
}

/**
 * Standardized payment request format
 */
export interface StandardPaymentRequest {
  meter_id: MeterId;
  amount: PaymentAmount;
  userId: UserId;
  timestamp?: Timestamp;
}

/**
 * Standardized payment response format
 */
export interface StandardPaymentResponse {
  success: boolean;
  transactionId?: string;
  error?: string;
  timestamp: Timestamp;
  rateLimitInfo?: StandardRateLimitInfo;
}

/**
 * Standardized rate limit information
 */
export interface StandardRateLimitInfo {
  remainingRequests: number;
  resetTime: Timestamp;
  allowed: boolean;
  queued?: boolean;
  queuePosition?: number;
  queueLength?: number;
}

/**
 * Standardized payment information
 */
export interface StandardPaymentInfo {
  meter_id: MeterId;
  totalPaid: PaymentAmount;
  network: string;
  timestamp: Timestamp;
}
