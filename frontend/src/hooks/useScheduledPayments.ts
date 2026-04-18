import { useState, useEffect, useCallback } from 'react';
import { SchedulingService } from '../services/schedulingService';
import type { PaymentSchedule, ScheduleFormData, CreateScheduleResponse } from '../types/scheduling';

export const useScheduledPayments = (userId: string) => {
  const [schedules, setSchedules] = useState<PaymentSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);

  const schedulingService = SchedulingService.getInstance();

  const fetchSchedules = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const response = await schedulingService.getUserSchedules(userId);
      if (response.success) {
        setSchedules(response.schedules || []);
        setAnalytics(response.analytics);
      } else {
        setError(response.error || 'Failed to fetch schedules');
      }
    } catch (err) {
      setError('An error occurred while fetching schedules');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const createSchedule = async (data: ScheduleFormData): Promise<CreateScheduleResponse> => {
    const result = await schedulingService.createSchedule(userId, data);
    if (result.success) {
      await fetchSchedules();
    }
    return result;
  };

  const cancelSchedule = async (scheduleId: string, reason?: string) => {
    const result = await schedulingService.cancelSchedule(scheduleId, reason);
    if (result.success) {
      await fetchSchedules();
    }
    return result;
  };

  return {
    schedules,
    loading,
    error,
    analytics,
    createSchedule,
    cancelSchedule,
    refreshSchedules: fetchSchedules
  };
};