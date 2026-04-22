import type {
  PaymentSchedule as StandardPaymentSchedule,
  ScheduledPayment as StandardScheduledPayment,
  NotificationSettings as StandardNotificationSettings,
  Amount,
  Timestamp
} from '../../../shared/types';
import {
  PaymentFrequency as StandardPaymentFrequency,
  PaymentStatus as StandardPaymentStatus,
  Currency,
  dateToTimestamp,
  timestampToDate
} from '../../../shared/types';

// Legacy enums for backward compatibility - marked as deprecated
/** @deprecated Use StandardPaymentFrequency from shared/types instead */
export enum PaymentFrequency {
  ONCE = 'once',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly'
}

/** @deprecated Use StandardPaymentStatus from shared/types instead */
export enum PaymentStatus {
  PENDING = 'pending',
  SCHEDULED = 'scheduled',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PAUSED = 'paused'
}

export enum NotificationType {
  PAYMENT_DUE = 'payment_due',
  PAYMENT_SUCCESS = 'payment_success',
  PAYMENT_FAILED = 'payment_failed',
  SCHEDULE_CREATED = 'schedule_created',
  SCHEDULE_CANCELLED = 'schedule_cancelled'
}

// Legacy interfaces for backward compatibility - marked as deprecated
/** @deprecated Use StandardPaymentSchedule from shared/types instead */
export interface PaymentSchedule {
  id: string;
  userId: string;
  meterId: string;
  amount: number;
  frequency: PaymentFrequency;
  startDate: Date;
  endDate?: Date;
  nextPaymentDate: Date;
  status: PaymentStatus;
  description?: string;
  maxPayments?: number;
  currentPaymentCount: number;
  createdAt: Date;
  updatedAt: Date;
  notificationSettings: NotificationSettings;
  paymentHistory: ScheduledPayment[];
}

/** @deprecated Use StandardScheduledPayment from shared/types instead */
export interface ScheduledPayment {
  id: string;
  scheduleId: string;
  amount: number;
  scheduledDate: Date;
  actualPaymentDate?: Date;
  status: PaymentStatus;
  transactionId?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: Date;
}

/** @deprecated Use StandardNotificationSettings from shared/types instead */
export interface NotificationSettings {
  email: boolean;
  push: boolean;
  sms: boolean;
  reminderDays: number[];
  successNotification: boolean;
  failureNotification: boolean;
}

// Conversion utilities
function convertLegacyScheduleToStandard(legacy: PaymentSchedule): StandardPaymentSchedule {
  return {
    ...legacy,
    amount: legacy.amount.toString() as Amount,
    currency: Currency.XLM,
    frequency: legacy.frequency as unknown as StandardPaymentFrequency,
    startDate: dateToTimestamp(legacy.startDate),
    endDate: legacy.endDate ? dateToTimestamp(legacy.endDate) : undefined,
    nextPaymentDate: dateToTimestamp(legacy.nextPaymentDate),
    status: convertLegacyStatusToStandard(legacy.status),
    createdAt: dateToTimestamp(legacy.createdAt),
    updatedAt: dateToTimestamp(legacy.updatedAt),
    notificationSettings: legacy.notificationSettings as StandardNotificationSettings,
    paymentHistory: legacy.paymentHistory.map(convertLegacyPaymentToStandard)
  };
}

function convertStandardScheduleToLegacy(standard: StandardPaymentSchedule): PaymentSchedule {
  return {
    ...standard,
    amount: parseFloat(standard.amount),
    frequency: standard.frequency as unknown as PaymentFrequency,
    startDate: timestampToDate(standard.startDate),
    endDate: standard.endDate ? timestampToDate(standard.endDate) : undefined,
    nextPaymentDate: timestampToDate(standard.nextPaymentDate),
    status: convertStandardStatusToLegacy(standard.status),
    createdAt: timestampToDate(standard.createdAt),
    updatedAt: timestampToDate(standard.updatedAt),
    notificationSettings: standard.notificationSettings as NotificationSettings,
    paymentHistory: standard.paymentHistory.map(convertStandardPaymentToLegacy)
  };
}

function convertLegacyPaymentToStandard(legacy: ScheduledPayment): StandardScheduledPayment {
  return {
    ...legacy,
    amount: legacy.amount.toString() as Amount,
    currency: Currency.XLM,
    scheduledDate: dateToTimestamp(legacy.scheduledDate),
    actualPaymentDate: legacy.actualPaymentDate ? dateToTimestamp(legacy.actualPaymentDate) : undefined,
    status: convertLegacyStatusToStandard(legacy.status),
    createdAt: dateToTimestamp(legacy.createdAt)
  };
}

function convertStandardPaymentToLegacy(standard: StandardScheduledPayment): ScheduledPayment {
  return {
    ...standard,
    amount: parseFloat(standard.amount),
    scheduledDate: timestampToDate(standard.scheduledDate),
    actualPaymentDate: standard.actualPaymentDate ? timestampToDate(standard.actualPaymentDate) : undefined,
    status: convertStandardStatusToLegacy(standard.status),
    createdAt: timestampToDate(standard.createdAt)
  };
}

// Helper functions to handle enum conversions
function convertLegacyStatusToStandard(legacy: PaymentStatus): StandardPaymentStatus {
  switch (legacy) {
    case PaymentStatus.PENDING:
      return StandardPaymentStatus.PENDING;
    case PaymentStatus.SCHEDULED:
      return StandardPaymentStatus.SCHEDULED;
    case PaymentStatus.PROCESSING:
      return StandardPaymentStatus.PROCESSING;
    case PaymentStatus.COMPLETED:
      return StandardPaymentStatus.COMPLETED;
    case PaymentStatus.FAILED:
      return StandardPaymentStatus.FAILED;
    case PaymentStatus.CANCELLED:
      return StandardPaymentStatus.CANCELLED;
    case PaymentStatus.PAUSED:
      return StandardPaymentStatus.PENDING; // Map PAUSED to PENDING as it doesn't exist in standard
    default:
      return StandardPaymentStatus.PENDING;
  }
}

function convertStandardStatusToLegacy(standard: StandardPaymentStatus): PaymentStatus {
  switch (standard) {
    case StandardPaymentStatus.PENDING:
      return PaymentStatus.PENDING;
    case StandardPaymentStatus.SCHEDULED:
      return PaymentStatus.SCHEDULED;
    case StandardPaymentStatus.PROCESSING:
      return PaymentStatus.PROCESSING;
    case StandardPaymentStatus.COMPLETED:
      return PaymentStatus.COMPLETED;
    case StandardPaymentStatus.FAILED:
      return PaymentStatus.FAILED;
    case StandardPaymentStatus.CANCELLED:
      return PaymentStatus.CANCELLED;
    case StandardPaymentStatus.QUEUED:
      return PaymentStatus.PENDING; // Map QUEUED to PENDING as it doesn't exist in legacy
    default:
      return PaymentStatus.PENDING;
  }
}

// Export conversion functions for external use
export {
  convertLegacyScheduleToStandard,
  convertStandardScheduleToLegacy,
  convertLegacyPaymentToStandard,
  convertStandardPaymentToLegacy
};

// Re-export standard types for convenience
export type {
  PaymentFrequency as PaymentFrequencyStandard,
  PaymentStatus as PaymentStatusStandard,
  PaymentSchedule as PaymentScheduleStandard,
  ScheduledPayment as ScheduledPaymentStandard,
  NotificationSettings as NotificationSettingsStandard
} from '../../../shared/types';

/** @deprecated Use standardized form data structure */
export interface ScheduleFormData {
  meterId: string;
  amount: string;
  frequency: PaymentFrequency;
  startDate: string;
  endDate?: string;
  description?: string;
  maxPayments?: string;
  notificationSettings: NotificationSettings;
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  description: string;
  frequency: PaymentFrequency;
  suggestedAmount?: number;
  commonUseCases: string[];
}

export interface PaymentAnalytics {
  totalScheduled: number;
  totalCompleted: number;
  totalFailed: number;
  averageAmount: number;
  nextPaymentAmount: number;
  nextPaymentDate: Date;
  activeSchedules: number;
  monthlyProjection: number;
}

export interface CalendarEvent {
  date: Date;
  payments: ScheduledPayment[];
  totalAmount: number;
  status: 'upcoming' | 'completed' | 'failed';
}

// Validation types
export interface ScheduleValidationError {
  field: string;
  message: string;
}

export interface ScheduleValidationResult {
  isValid: boolean;
  errors: ScheduleValidationError[];
  warnings: ScheduleValidationError[];
}

// Helper types for calculations
export interface PaymentCalculation {
  nextPaymentDate: Date;
  paymentCount: number;
  remainingPayments: number;
  totalAmount: number;
  projection: {
    monthly: number;
    quarterly: number;
    yearly: number;
  };
}

// API Response types
export interface CreateScheduleResponse {
  success: boolean;
  schedule?: PaymentSchedule;
  error?: string;
}

export interface UpdateScheduleResponse {
  success: boolean;
  schedule?: PaymentSchedule;
  error?: string;
}

export interface GetSchedulesResponse {
  success: boolean;
  schedules?: PaymentSchedule[];
  analytics?: PaymentAnalytics;
  error?: string;
}

export interface CancelScheduleResponse {
  success: boolean;
  cancelledPayments?: number;
  refundAmount?: number;
  error?: string;
}

// Calendar view types
export interface CalendarView {
  month: Date;
  events: CalendarEvent[];
  selectedDate?: Date;
  viewMode: 'month' | 'week' | 'day';
}

// Recurrence calculation types
export interface RecurrenceRule {
  frequency: PaymentFrequency;
  interval: number;
  count?: number;
  until?: Date;
  byWeekDay?: number[];
  byMonthDay?: number[];
}

// Notification payload types
export interface PaymentNotification {
  type: NotificationType;
  scheduleId: string;
  paymentId?: string;
  message: string;
  scheduledDate: Date;
  amount: number;
  meterId: string;
  actionUrl?: string;
}

// Export utility types
export interface ScheduleExport {
  format: 'csv' | 'json' | 'pdf';
  dateRange: {
    start: Date;
    end: Date;
  };
  includeHistory: boolean;
  includeAnalytics: boolean;
}
