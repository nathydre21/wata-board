import { PaymentSchedule, ScheduleFormData, CreateScheduleResponse } from '../types/scheduling';

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
}