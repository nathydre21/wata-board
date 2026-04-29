/**
 * Frontend Scheduling Types - Re-export from shared types for consistency
 */
export type {
  PaymentFrequency as PaymentFrequencyType,
  PaymentStatus as PaymentStatusType,
  PaymentSchedule,
  ScheduledPayment,
  NotificationSettings
} from '../../../shared/types';

// Import the actual types for use in functions
import type { PaymentSchedule as SharedPaymentSchedule, ScheduledPayment as SharedScheduledPayment } from '../../../shared/types';
import { toISOString, fromDateISOString } from '../../../shared/types';

// Additional frontend-specific enums and interfaces
export enum NotificationType {
  PAYMENT_DUE = 'payment_due',
  PAYMENT_SUCCESS = 'payment_success',
  PAYMENT_FAILED = 'payment_failed',
  SCHEDULE_CREATED = 'schedule_created',
  SCHEDULE_CANCELLED = 'schedule_cancelled'
}

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

// Type aliases for backward compatibility
export type PaymentFrequency = Parameters<typeof convertToFrontendSchedule>[0]['frequency'];
export type PaymentStatus = Parameters<typeof convertToFrontendSchedule>[0]['status'];

export function convertToFrontendSchedule(sharedSchedule: SharedPaymentSchedule): PaymentSchedule {
  return {
    ...sharedSchedule,
    startDate: fromDateISOString(sharedSchedule.startDate),
    endDate: sharedSchedule.endDate ? fromDateISOString(sharedSchedule.endDate) : undefined,
    nextPaymentDate: fromDateISOString(sharedSchedule.nextPaymentDate),
    createdAt: fromDateISOString(sharedSchedule.createdAt),
    updatedAt: fromDateISOString(sharedSchedule.updatedAt),
    paymentHistory: sharedSchedule.paymentHistory.map(payment => convertToFrontendScheduledPayment(payment))
  };
}

export function convertToSharedSchedule(frontendSchedule: PaymentSchedule): SharedPaymentSchedule {
  return {
    ...frontendSchedule,
    startDate: toISOString(frontendSchedule.startDate),
    endDate: frontendSchedule.endDate ? toISOString(frontendSchedule.endDate) : undefined,
    nextPaymentDate: toISOString(frontendSchedule.nextPaymentDate),
    createdAt: toISOString(frontendSchedule.createdAt),
    updatedAt: toISOString(frontendSchedule.updatedAt),
    paymentHistory: frontendSchedule.paymentHistory.map(payment => convertToSharedScheduledPayment(payment))
  };
}

function convertToFrontendScheduledPayment(sharedPayment: SharedScheduledPayment): ScheduledPayment {
  return {
    ...sharedPayment,
    scheduledDate: fromDateISOString(sharedPayment.scheduledDate),
    actualPaymentDate: sharedPayment.actualPaymentDate ? fromDateISOString(sharedPayment.actualPaymentDate) : undefined,
    createdAt: fromDateISOString(sharedPayment.createdAt)
  };
}

function convertToSharedScheduledPayment(frontendPayment: ScheduledPayment): SharedScheduledPayment {
  return {
    ...frontendPayment,
    scheduledDate: toISOString(frontendPayment.scheduledDate),
    actualPaymentDate: frontendPayment.actualPaymentDate ? toISOString(frontendPayment.actualPaymentDate) : undefined,
    createdAt: toISOString(frontendPayment.createdAt)
  };
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
