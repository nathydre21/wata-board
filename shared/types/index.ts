/**
 * Standardized Data Types for Wata-Board System
 * This file ensures consistent data formats across frontend, backend, and database
 */

// ===== CORE DATA TYPES =====

/**
 * Standardized meter identifier format
 */
export type MeterId = string;

/**
 * Standardized user identifier format  
 */
export type UserId = string;

/**
 * Standardized transaction identifier format
 */
export type TransactionId = string;

/**
 * Standardized amount format - always in smallest currency unit (stroops for XLM)
 * Using string to avoid floating point precision issues
 */
export type Amount = string;

/**
 * Standardized timestamp format - ISO 8601 string
 */
export type Timestamp = string;

// ===== ENUMS =====

/**
 * Payment status enumeration
 */
export enum PaymentStatus {
  PENDING = 'pending',
  SCHEDULED = 'scheduled', 
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  QUEUED = 'queued'
}

/**
 * Payment frequency enumeration
 */
export enum PaymentFrequency {
  ONCE = 'once',
  DAILY = 'daily',
  WEEKLY = 'weekly', 
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly'
}

/**
 * Network enumeration
 */
export enum Network {
  TESTNET = 'testnet',
  MAINNET = 'mainnet'
}

/**
 * Currency enumeration
 */
export enum Currency {
  XLM = 'XLM'
}

/**
 * Meter type enumeration
 */
export enum MeterType {
  ELECTRICITY = 'electricity',
  WATER = 'water',
  GAS = 'gas'
}

// ===== INTERFACES =====

/**
 * Standardized payment request format
 */
export interface PaymentRequest {
  meterId: MeterId;
  amount: Amount;
  userId: UserId;
  currency?: Currency;
  network?: Network;
}

/**
 * Standardized payment response format
 */
export interface PaymentResponse {
  success: boolean;
  transactionId?: TransactionId;
  error?: string;
  rateLimitInfo?: RateLimitInfo;
  timestamp: Timestamp;
}

/**
 * Standardized rate limit information
 */
export interface RateLimitInfo {
  remainingRequests: number;
  resetTime: Timestamp;
  allowed: boolean;
  queued: boolean;
  queuePosition?: number;
  windowMs: number;
  maxRequests: number;
}

/**
 * Standardized payment information
 */
export interface PaymentInfo {
  success: boolean;
  data?: {
    meterId: MeterId;
    totalPaid: Amount;
    currency: Currency;
    network: Network;
    lastUpdated: Timestamp;
  };
  error?: string;
  timestamp: Timestamp;
}

/**
 * Standardized payment schedule interface
 */
export interface PaymentSchedule {
  id: string;
  userId: UserId;
  meterId: MeterId;
  amount: Amount;
  currency: Currency;
  frequency: PaymentFrequency;
  startDate: Timestamp;
  endDate?: Timestamp;
  nextPaymentDate: Timestamp;
  status: PaymentStatus;
  description?: string;
  maxPayments?: number;
  currentPaymentCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  notificationSettings: NotificationSettings;
  paymentHistory: ScheduledPayment[];
}

/**
 * Standardized scheduled payment interface
 */
export interface ScheduledPayment {
  id: string;
  scheduleId: string;
  amount: Amount;
  currency: Currency;
  scheduledDate: Timestamp;
  actualPaymentDate?: Timestamp;
  status: PaymentStatus;
  transactionId?: TransactionId;
  errorMessage?: string;
  retryCount: number;
  createdAt: Timestamp;
}

/**
 * Standardized notification settings
 */
export interface NotificationSettings {
  email: boolean;
  push: boolean;
  sms: boolean;
  reminderDays: number[];
  successNotification: boolean;
  failureNotification: boolean;
}

/**
 * Standardized user interface
 */
export interface User {
  id: UserId;
  stellarPublicKey: string;
  email?: string;
  phone?: string;
  fullName?: string;
  isActive: boolean;
  isVerified: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLogin?: Timestamp;
  metadata: Record<string, any>;
}

/**
 * Standardized meter interface
 */
export interface Meter {
  id: string;
  meterId: MeterId;
  userId: UserId;
  meterType: MeterType;
  utilityCompany?: string;
  address?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  metadata: Record<string, any>;
}

/**
 * Standardized health status
 */
export interface HealthStatus {
  status: string;
  timestamp: Timestamp;
  version: string;
  environment: string;
  network: Network;
  uptime?: number;
}

// ===== API RESPONSE WRAPPERS =====

/**
 * Standardized API response wrapper for success
 */
export interface ApiResponse<T = any> {
  success: true;
  data: T;
  timestamp: Timestamp;
  requestId?: string;
}

/**
 * Standardized API response wrapper for errors
 */
export interface ApiError {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, any>;
  timestamp: Timestamp;
  requestId?: string;
}

/**
 * Union type for all API responses
 */
export type ApiResponseUnion<T = any> = ApiResponse<T> | ApiError;

// ===== VALIDATION TYPES =====

/**
 * Standardized validation error
 */
export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

/**
 * Standardized validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// ===== UTILITY TYPES =====

/**
 * Database entity with timestamps
 */
export interface TimestampedEntity {
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Soft deletable entity
 */
export interface SoftDeletable {
  isDeleted: boolean;
  deletedAt?: Timestamp;
}

/**
 * Metadata entity
 */
export interface WithMetadata {
  metadata: Record<string, any>;
}

// ===== TYPE GUARDS =====

/**
 * Type guard for payment requests
 */
export function isPaymentRequest(obj: any): obj is PaymentRequest {
  return (
    typeof obj === 'object' &&
    typeof obj.meterId === 'string' &&
    typeof obj.amount === 'string' &&
    typeof obj.userId === 'string' &&
    (obj.currency === undefined || Object.values(Currency).includes(obj.currency)) &&
    (obj.network === undefined || Object.values(Network).includes(obj.network))
  );
}

/**
 * Type guard for API responses
 */
export function isApiResponse<T>(obj: any): obj is ApiResponse<T> {
  return (
    typeof obj === 'object' &&
    obj.success === true &&
    typeof obj.data !== 'undefined' &&
    typeof obj.timestamp === 'string'
  );
}

/**
 * Type guard for API errors
 */
export function isApiError(obj: any): obj is ApiError {
  return (
    typeof obj === 'object' &&
    obj.success === false &&
    typeof obj.error === 'string' &&
    typeof obj.timestamp === 'string'
  );
}

// ===== CONVERSION UTILITIES =====

/**
 * Convert number amount to standardized Amount string
 */
export function amountToString(amount: number): Amount {
  return amount.toString();
}

/**
 * Convert standardized Amount string to number
 */
export function amountToNumber(amount: Amount): number {
  return parseFloat(amount);
}

/**
 * Convert Date to standardized Timestamp
 */
export function dateToTimestamp(date: Date): Timestamp {
  return date.toISOString();
}

/**
 * Convert standardized Timestamp to Date
 */
export function timestampToDate(timestamp: Timestamp): Date {
  return new Date(timestamp);
}

/**
 * Get current timestamp
 */
export function getCurrentTimestamp(): Timestamp {
  return new Date().toISOString();
}

// ===== CONSTANTS =====

/**
 * Default currency
 */
export const DEFAULT_CURRENCY = Currency.XLM;

/**
 * Default network
 */
export const DEFAULT_NETWORK = Network.TESTNET;

/**
 * Maximum amount limit
 */
export const MAX_AMOUNT = '10000000000'; // 10,000 XLM in stroops

/**
 * Minimum amount limit  
 */
export const MIN_AMOUNT = '1'; // 1 stroop

/**
 * Default rate limit configuration
 */
export const DEFAULT_RATE_LIMIT = {
  windowMs: 60000, // 1 minute
  maxRequests: 5,
  queueSize: 10
} as const;
