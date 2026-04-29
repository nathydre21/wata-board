import { PaymentSchedule, ScheduleFormData, CreateScheduleResponse, ScheduleValidationResult, PaymentConflict, ConflictDetectionResult, PaymentFrequency, PaymentStatus } from '../types/scheduling';

export class SchedulingService {
  private static instance: SchedulingService;
  private storageKey = 'wata-board-schedules';

  private constructor() {}

  public static getInstance(): SchedulingService {
    if (!SchedulingService.instance) {
      SchedulingService.instance = new SchedulingService();
    }
    return SchedulingService.instance;
  }

  async getUserSchedules(userId: string): Promise<CreateScheduleResponse> {
    try {
      const data = localStorage.getItem(this.storageKey);
      const allSchedules: PaymentSchedule[] = data ? JSON.parse(data) : [];
      const userSchedules = allSchedules.filter(s => s.userId === userId);
      
      // Mock analytics calculation
      const analytics = {
        activeSchedules: userSchedules.filter(s => s.status === 'scheduled').length,
        totalAmount: userSchedules.reduce((acc, s) => acc + (s.amount * s.currentPaymentCount), 0),
        monthlyProjection: userSchedules.reduce((acc, s) => acc + (s.amount * (s.frequency === 'daily' ? 30 : s.frequency === 'weekly' ? 4 : 1)), 0),
        nextPaymentAmount: userSchedules[0]?.amount || 0,
        nextPaymentDate: userSchedules[0]?.nextPaymentDate || new Date().toISOString()
      };

      return { success: true, schedules: userSchedules, analytics };
    } catch (error) {
      return { success: false, error: 'Failed to retrieve schedules' };
    }
  }

  async createSchedule(userId: string, data: ScheduleFormData): Promise<CreateScheduleResponse> {
    try {
      const newSchedule: PaymentSchedule = {
        id: `sched_${Date.now()}`,
        userId,
        ...data,
        status: 'scheduled' as any,
        createdAt: new Date().toISOString(),
        currentPaymentCount: 0,
        nextPaymentDate: data.startDate
      };

      const existing = localStorage.getItem(this.storageKey);
      const schedules = existing ? JSON.parse(existing) : [];
      schedules.push(newSchedule);
      localStorage.setItem(this.storageKey, JSON.stringify(schedules));

      return { success: true, schedules: [newSchedule] };
    } catch (error) {
      return { success: false, error: 'Failed to create schedule' };
    }
  }

  async cancelSchedule(scheduleId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (!data) return { success: false, error: 'No schedules found' };

      let schedules: PaymentSchedule[] = JSON.parse(data);
      schedules = schedules.map(s => s.id === scheduleId ? { ...s, status: 'cancelled' as any } : s);
      localStorage.setItem(this.storageKey, JSON.stringify(schedules));

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to cancel schedule' };
    }
  }
<<<<<<< HEAD

  validateSchedule(formData: ScheduleFormData): ScheduleValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];

    // Basic validation
    if (!formData.meterId || formData.meterId.trim().length === 0) {
      errors.push({ field: 'meterId', message: 'Meter ID is required' });
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      errors.push({ field: 'amount', message: 'Amount must be greater than 0' });
    }

    if (parseFloat(formData.amount) > 10000) {
      errors.push({ field: 'amount', message: 'Amount cannot exceed 10,000 XLM' });
    }

    if (!formData.startDate) {
      errors.push({ field: 'startDate', message: 'Start date is required' });
    } else {
      const startDate = new Date(formData.startDate);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      if (startDate < tomorrow) {
        errors.push({ field: 'startDate', message: 'Start date must be at least tomorrow' });
      }
    }

    if (formData.endDate && formData.startDate) {
      const startDate = new Date(formData.startDate);
      const endDate = new Date(formData.endDate);
      
      if (endDate <= startDate) {
        errors.push({ field: 'endDate', message: 'End date must be after start date' });
      }
    }

    if (formData.maxPayments && parseInt(formData.maxPayments) <= 0) {
      errors.push({ field: 'maxPayments', message: 'Maximum payments must be greater than 0' });
    }

    // Conflict detection
    const conflicts = this.detectConflicts(formData);
    conflicts.forEach(conflict => {
      if (conflict.severity === 'high') {
        errors.push({ field: 'conflict', message: conflict.message });
      } else {
        warnings.push({ field: 'conflict', message: conflict.message });
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  detectConflicts(formData: ScheduleFormData, excludeScheduleId?: string): ConflictDetectionResult {
    const conflicts: PaymentConflict[] = [];
    
    try {
      const data = localStorage.getItem(this.storageKey);
      const existingSchedules: PaymentSchedule[] = data ? JSON.parse(data) : [];
      
      // Filter out the schedule being edited (if any)
      const relevantSchedules = existingSchedules.filter(s => 
        s.id !== excludeScheduleId && 
        s.status !== PaymentStatus.CANCELLED && 
        s.status !== PaymentStatus.COMPLETED
      );

      // Check for same meter conflicts
      const sameMeterSchedules = relevantSchedules.filter(s => s.meterId === formData.meterId);
      
      if (sameMeterSchedules.length > 0) {
        sameMeterSchedules.forEach(existingSchedule => {
          const conflict = this.analyzeMeterConflict(formData, existingSchedule);
          if (conflict) {
            conflicts.push(conflict);
          }
        });
      }

    } catch (error) {
      console.error('Error detecting conflicts:', error);
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      resolutions: []
    };
  }

  private analyzeMeterConflict(newSchedule: ScheduleFormData, existingSchedule: PaymentSchedule): PaymentConflict | null {
    const newAmount = parseFloat(newSchedule.amount);
    const newStartDate = new Date(newSchedule.startDate);
    const newEndDate = newSchedule.endDate ? new Date(newSchedule.endDate) : null;
    
    const existingStartDate = new Date(existingSchedule.startDate);
    const existingEndDate = existingSchedule.endDate ? new Date(existingSchedule.endDate) : null;

    // Check for exact duplicate
    if (Math.abs(newAmount - existingSchedule.amount) < 0.01 &&
        newSchedule.frequency === existingSchedule.frequency &&
        newStartDate.toDateString() === existingStartDate.toDateString()) {
      
      return {
        id: `conflict_${Date.now()}`,
        type: 'duplicate_schedule',
        severity: 'high',
        message: `Duplicate payment schedule found for meter ${newSchedule.meterId}. A schedule with the same amount, frequency, and start date already exists.`,
        conflictingScheduleIds: [existingSchedule.id],
        suggestedResolution: 'replace',
        details: {
          meterId: newSchedule.meterId,
          conflictingAmounts: [newAmount, existingSchedule.amount],
          conflictingDates: [newSchedule.startDate, existingSchedule.startDate],
          frequency: newSchedule.frequency
        }
      };
    }

    // Check for overlapping payments
    const hasDateOverlap = this.checkDateOverlap(
      newStartDate, newEndDate, newSchedule.frequency,
      existingStartDate, existingEndDate, existingSchedule.frequency
    );

    if (hasDateOverlap) {
      const severity = newAmount === existingSchedule.amount ? 'medium' : 'low';
      
      return {
        id: `conflict_${Date.now()}`,
        type: 'overlapping_payment',
        severity,
        message: `Overlapping payment schedule detected for meter ${newSchedule.meterId}. Multiple payments may be processed around the same time.`,
        conflictingScheduleIds: [existingSchedule.id],
        suggestedResolution: newAmount === existingSchedule.amount ? 'merge' : 'keep_both',
        details: {
          meterId: newSchedule.meterId,
          conflictingAmounts: [newAmount, existingSchedule.amount],
          conflictingDates: [newSchedule.startDate, existingSchedule.startDate],
          frequency: newSchedule.frequency
        }
      };
    }

    // Check for same meter different amount
    if (Math.abs(newAmount - existingSchedule.amount) > 0.01) {
      return {
        id: `conflict_${Date.now()}`,
        type: 'same_meter_conflict',
        severity: 'medium',
        message: `Different payment amount for meter ${newSchedule.meterId}. Existing schedule: ${existingSchedule.amount} XLM, New schedule: ${newAmount} XLM.`,
        conflictingScheduleIds: [existingSchedule.id],
        suggestedResolution: 'replace',
        details: {
          meterId: newSchedule.meterId,
          conflictingAmounts: [newAmount, existingSchedule.amount],
          frequency: newSchedule.frequency
        }
      };
    }

    return null;
  }

  private checkDateOverlap(
    newStart: Date, newEnd: Date | null, newFreq: PaymentFrequency,
    existingStart: Date, existingEnd: Date | null, existingFreq: PaymentFrequency
  ): boolean {
    // Simple overlap check - can be enhanced based on frequency
    const effectiveNewEnd = newEnd || new Date(newStart.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year default
    const effectiveExistingEnd = existingEnd || new Date(existingStart.getTime() + 365 * 24 * 60 * 60 * 1000);

    // Check if date ranges overlap
    return newStart <= effectiveExistingEnd && existingStart <= effectiveNewEnd;
  }

  async resolveConflict(resolution: any): Promise<{ success: boolean; error?: string }> {
    try {
      // Implementation for conflict resolution
      // This would handle merging, replacing, or canceling schedules
      console.log('Resolving conflict:', resolution);
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to resolve conflict' };
    }
  }
}
