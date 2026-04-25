import { useEffect, useCallback } from 'react';
import PushNotificationService from '../services/pushNotificationService';

interface UsePaymentNotificationsReturn {
  isEnabled: boolean;
  requestPermission: () => Promise<boolean>;
  sendTestNotification: () => Promise<void>;
  handlePaymentStatus: (status: string, transactionId: string, data?: any) => Promise<void>;
}

export const usePaymentNotifications = (): UsePaymentNotificationsReturn => {
  const pushService = PushNotificationService.getInstance();

  const isEnabled = pushService.isEnabled();

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const permission = await pushService.requestPermission();
    return permission === 'granted';
  }, [pushService]);

  const sendTestNotification = useCallback(async (): Promise<void> => {
    await pushService.showLocalNotification({
      type: 'payment-confirmed',
      title: 'Test Notification',
      body: 'This is a test notification from Wata-Board.',
      data: { test: true }
    });
  }, [pushService]);

  const handlePaymentStatus = useCallback(async (
    status: string, 
    transactionId: string, 
    data?: any
  ): Promise<void> => {
    await pushService.handlePaymentStatus(status, transactionId, data);
  }, [pushService]);

  return {
    isEnabled,
    requestPermission,
    sendTestNotification,
    handlePaymentStatus
  };
};

export default usePaymentNotifications;
