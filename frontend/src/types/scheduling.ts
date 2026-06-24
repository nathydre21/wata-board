/**
 * Frontend Scheduling Types
 * Uses shared types directly (ISO string dates) for consistency.
 */
import type {
  PaymentSchedule as SharedPaymentSchedule,
  ScheduledPayment as SharedScheduledPayment,
  NotificationSettings as SharedNotificationSettings,
  PaymentFrequency as SharedPaymentFrequency,
  PaymentStatus as SharedPaymentStatus
} from '../../../shared/types';

// Re-export shared types directly — no Date conversion, keep strings
export type PaymentSchedule = SharedPaymentSchedule;
export type ScheduledPayment = SharedScheduledPayment;
export type NotificationSettings = SharedNotificationSettings;

// Re-export enum values for backward compatibility
export const PaymentFrequency = {
  ONCE: 'once' as const,
  DAILY: 'daily' as const,
  WEEKLY: 'weekly' as const,
  BIWEEKLY: 'biweekly' as const,
  MONTHLY: 'monthly' as const,
  QUARTERLY: 'quarterly' as const,
  YEARLY: 'yearly' as const
};

export const PaymentStatus = {
  PENDING: 'pending' as const,
  SCHEDULED: 'scheduled' as const,
  PROCESSING: 'processing' as const,
  COMPLETED: 'completed' as const,
  FAILED: 'failed' as const,
  CANCELLED: 'cancelled' as const,
  PAUSED: 'paused' as const
};

export type PaymentFrequency = SharedPaymentFrequency;
export type PaymentStatus = SharedPaymentStatus;

// Additional frontend-specific enums
export enum NotificationType {
  PAYMENT_DUE = 'payment_due',
  PAYMENT_SUCCESS = 'payment_success',
  PAYMENT_FAILED = 'payment_failed',
  SCHEDULE_CREATED = 'schedule_created',
  SCHEDULE_CANCELLED = 'schedule_cancelled'
}

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
  nextPaymentDate: string;
  activeSchedules: number;
  monthlyProjection: number;
}

export interface CalendarEvent {
  date: string;
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

// Conflict detection types
export interface PaymentConflict {
  id: string;
  type: 'duplicate_schedule' | 'overlapping_payment' | 'same_meter_conflict';
  severity: 'low' | 'medium' | 'high';
  message: string;
  conflictingScheduleIds: string[];
  suggestedResolution: 'merge' | 'replace' | 'keep_both' | 'cancel_one';
  details?: {
    meterId: string;
    conflictingAmounts?: number[];
    conflictingDates?: string[];
    frequency?: PaymentFrequency;
  };
}

export interface ConflictResolution {
  conflictId: string;
  action: 'merge' | 'replace' | 'keep_both' | 'cancel_one';
  selectedScheduleId?: string;
  mergedScheduleData?: Partial<ScheduleFormData>;
}

export interface ConflictDetectionResult {
  hasConflicts: boolean;
  conflicts: PaymentConflict[];
  resolutions: ConflictResolution[];
}

// Helper types for calculations
export interface PaymentCalculation {
  nextPaymentDate: string;
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
  month: string;
  events: CalendarEvent[];
  selectedDate?: string;
  viewMode: 'month' | 'week' | 'day';
}

// Recurrence calculation types
export interface RecurrenceRule {
  frequency: PaymentFrequency;
  interval: number;
  count?: number;
  until?: string;
  byWeekDay?: number[];
  byMonthDay?: number[];
}

// Notification payload types
export interface PaymentNotification {
  type: NotificationType;
  scheduleId: string;
  paymentId?: string;
  message: string;
  scheduledDate: string;
  amount: number;
  meterId: string;
  actionUrl?: string;
}

// Export utility types
export interface ScheduleExport {
  format: 'csv' | 'json' | 'pdf';
  dateRange: {
    start: string;
    end: string;
  };
  includeHistory: boolean;
  includeAnalytics: boolean;
}
