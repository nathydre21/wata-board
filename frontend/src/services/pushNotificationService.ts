// Push Notification Service for Wata-Board
// Handles push notifications for payment status updates

export interface NotificationPreferences {
  paymentConfirmed: boolean;
  paymentFailed: boolean;
  paymentProcessing: boolean;
  paymentConfirmationRequired: boolean;
  offlineStatus: boolean;
  marketingUpdates: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  quietHours: {
    enabled: boolean;
    start: string; // HH:MM format
    end: string;   // HH:MM format
  };
}

export interface PushNotificationData {
  type: 'payment-confirmed' | 'payment-failed' | 'payment-processing' | 'payment-confirmation-required' | 'offline-status';
  title: string;
  body: string;
  data?: {
    transactionId?: string;
    paymentId?: string;
    meterId?: string;
    amount?: number;
    error?: string;
    [key: string]: any;
  };
  icon?: string;
  badge?: string;
  tag?: string;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

class PushNotificationService {
  private static instance: PushNotificationService;
  private registration: ServiceWorkerRegistration | null = null;
  private subscription: PushSubscription | null = null;
  private isSupported: boolean = false;
  private preferences: NotificationPreferences;

  private constructor() {
    this.preferences = this.loadPreferences();
    this.checkSupport();
  }

  static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  private checkSupport(): void {
    this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    
    if (!this.isSupported) {
      console.warn('[PushNotification] Push notifications not supported in this browser');
    }
  }

  /**
   * Initialize the push notification service
   */
  async initialize(): Promise<boolean> {
    if (!this.isSupported) {
      return false;
    }

    try {
      // Register service worker
      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      console.log('[PushNotification] Service worker registered:', this.registration.scope);

      // Get existing subscription
      this.subscription = await this.registration.pushManager.getSubscription();
      
      // Subscribe to push notifications if not already subscribed
      if (!this.subscription) {
        await this.subscribe();
      }

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage.bind(this));

      return true;
    } catch (error) {
      console.error('[PushNotification] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Subscribe to push notifications
   */
  async subscribe(): Promise<PushSubscription | null> {
    if (!this.registration) {
      console.error('[PushNotification] Service worker not registered');
      return null;
    }

    try {
      // Request notification permission first
      const permission = await this.requestPermission();
      if (permission !== 'granted') {
        console.warn('[PushNotification] Notification permission not granted:', permission);
        return null;
      }

      // Get VAPID public key (in production, this should come from your server)
      const applicationServerKey = this.getVAPIDPublicKey();

      // Subscribe to push
      this.subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });

      console.log('[PushNotification] Subscribed to push notifications');

      // Send subscription to server
      await this.sendSubscriptionToServer();

      return this.subscription;
    } catch (error) {
      console.error('[PushNotification] Failed to subscribe:', error);
      return null;
    }
  }

  /**
   * Request notification permission
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      return 'denied';
    }

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      return permission;
    }

    return Notification.permission;
  }

  /**
   * Get current permission status
   */
  getPermissionStatus(): NotificationPermission {
    if (!('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  }

  /**
   * Check if notifications are enabled
   */
  isEnabled(): boolean {
    return this.isSupported && this.getPermissionStatus() === 'granted';
  }

  /**
   * Send local notification (fallback when push is not available)
   */
  async showLocalNotification(data: PushNotificationData): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    // Check quiet hours
    if (this.isQuietHours() && data.type !== 'payment-failed') {
      console.log('[PushNotification] Notification suppressed due to quiet hours');
      return;
    }

    // Check preferences
    if (!this.shouldShowNotification(data.type)) {
      return;
    }

    const options: NotificationOptions = {
      body: data.body,
      icon: data.icon || '/icon-192x192.png',
      badge: data.badge || '/notification-badge.png',
      tag: data.tag || `payment-${data.type}`,
      data: data.data,
      requireInteraction: data.type === 'payment-failed' || data.type === 'payment-confirmation-required',
      actions: data.actions || [],
      silent: data.type === 'payment-processing' || !this.preferences.soundEnabled
    };

    // Add vibration if enabled
    if (this.preferences.vibrationEnabled && (data.type === 'payment-failed' || data.type === 'payment-confirmed')) {
      options.vibrate = [200, 100, 200];
    }

    const notification = new Notification(data.title, options);

    // Handle notification click
    notification.onclick = () => {
      this.handleNotificationClick(data);
      notification.close();
    };

    // Auto-close after 5 seconds for non-critical notifications
    if (data.type !== 'payment-failed' && data.type !== 'payment-confirmation-required') {
      setTimeout(() => {
        notification.close();
      }, 5000);
    }
  }

  /**
   * Send push notification to server
   */
  async sendPushNotification(data: PushNotificationData): Promise<boolean> {
    try {
      const response = await fetch('/api/notifications/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });

      return response.ok;
    } catch (error) {
      console.error('[PushNotification] Failed to send push notification:', error);
      return false;
    }
  }

  /**
   * Handle payment status update
   */
  async handlePaymentStatus(status: string, transactionId: string, data?: any): Promise<void> {
    const notificationData: PushNotificationData = {
      type: this.mapPaymentStatusToNotificationType(status),
      title: this.getPaymentStatusTitle(status, data),
      body: this.getPaymentStatusMessage(status, data),
      data: {
        transactionId,
        ...data
      },
      actions: this.getPaymentStatusActions(status, transactionId, data)
    };

    // Try push notification first, fallback to local
    const pushSent = await this.sendPushNotification(notificationData);
    if (!pushSent) {
      await this.showLocalNotification(notificationData);
    }
  }

  /**
   * Map payment status to notification type
   */
  private mapPaymentStatusToNotificationType(status: string): PushNotificationData['type'] {
    switch (status.toLowerCase()) {
      case 'confirmed':
      case 'completed':
        return 'payment-confirmed';
      case 'failed':
      case 'error':
        return 'payment-failed';
      case 'processing':
      case 'pending':
        return 'payment-processing';
      case 'confirmation_required':
        return 'payment-confirmation-required';
      default:
        return 'payment-processing';
    }
  }

  /**
   * Get notification title for payment status
   */
  private getPaymentStatusTitle(status: string, data?: any): string {
    switch (status.toLowerCase()) {
      case 'confirmed':
      case 'completed':
        return 'Payment Successful! ✅';
      case 'failed':
      case 'error':
        return 'Payment Failed ❌';
      case 'processing':
      case 'pending':
        return 'Payment Processing... ⏳';
      case 'confirmation_required':
        return 'Action Required ⚠️';
      default:
        return 'Payment Update';
    }
  }

  /**
   * Get notification message for payment status
   */
  private getPaymentStatusMessage(status: string, data?: any): string {
    const amount = data?.amount ? new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(data.amount) : '';
    const meterId = data?.meterId || '';

    switch (status.toLowerCase()) {
      case 'confirmed':
      case 'completed':
        return `Your payment of ${amount} for meter ${meterId} has been confirmed.`;
      case 'failed':
        return `Payment failed: ${data?.error || 'Unknown error'}. Please try again.`;
      case 'processing':
        return `Your payment of ${amount} for meter ${meterId} is being processed.`;
      case 'confirmation_required':
        return `Please confirm your payment of ${amount} for meter ${meterId}.`;
      default:
        return `Payment status updated to ${status}`;
    }
  }

  /**
   * Get notification actions for payment status
   */
  private getPaymentStatusActions(status: string, transactionId: string, data?: any): Array<{action: string, title: string, icon?: string}> {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return [
          { action: 'view-receipt', title: 'View Receipt', icon: '/receipt-icon.png' },
          { action: 'view-details', title: 'View Details', icon: '/details-icon.png' }
        ];
      case 'failed':
        return [
          { action: 'retry-payment', title: 'Retry Payment', icon: '/retry-icon.png' },
          { action: 'view-error', title: 'View Error', icon: '/error-icon.png' }
        ];
      case 'confirmation_required':
        return [
          { action: 'confirm-payment', title: 'Confirm Payment', icon: '/confirm-icon.png' },
          { action: 'cancel-payment', title: 'Cancel', icon: '/cancel-icon.png' }
        ];
      case 'processing':
        return [
          { action: 'track-payment', title: 'Track Payment', icon: '/track-icon.png' }
        ];
      default:
        return [];
    }
  }

  /**
   * Handle notification click
   */
  private handleNotificationClick(data: PushNotificationData): void {
    const { type, data: notificationData } = data;
    let url = '/';

    switch (type) {
      case 'payment-confirmed':
        url = `/receipt/${notificationData?.transactionId}`;
        break;
      case 'payment-failed':
        url = `/payment-details/${notificationData?.transactionId}`;
        break;
      case 'payment-confirmation-required':
        url = `/confirm-payment/${notificationData?.transactionId}`;
        break;
      case 'payment-processing':
        url = `/track-payment/${notificationData?.transactionId}`;
        break;
    }

    // Focus or open the relevant page
    window.open(url, '_self');
  }

  /**
   * Handle messages from service worker
   */
  private handleServiceWorkerMessage(event: MessageEvent): void {
    if (event.data?.type === 'NAVIGATE_TO') {
      window.location.href = event.data.url;
    }
  }

  /**
   * Check if it's quiet hours
   */
  private isQuietHours(): boolean {
    if (!this.preferences.quietHours.enabled) {
      return false;
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    return currentTime >= this.preferences.quietHours.start && currentTime <= this.preferences.quietHours.end;
  }

  /**
   * Check if notification should be shown based on preferences
   */
  private shouldShowNotification(type: PushNotificationData['type']): boolean {
    switch (type) {
      case 'payment-confirmed':
        return this.preferences.paymentConfirmed;
      case 'payment-failed':
        return this.preferences.paymentFailed;
      case 'payment-processing':
        return this.preferences.paymentProcessing;
      case 'payment-confirmation-required':
        return this.preferences.paymentConfirmationRequired;
      case 'offline-status':
        return this.preferences.offlineStatus;
      default:
        return true;
    }
  }

  /**
   * Get VAPID public key (in production, this should come from your server)
   */
  private getVAPIDPublicKey(): string {
    // This is a sample VAPID key - in production, use your server's key
    return 'BMxzFTLdK7yVdQ3kL8X8Q2rXJ3h8yN7k5Q2rXJ3h8yN7k5Q2rXJ3h8yN7k5Q';
  }

  /**
   * Send subscription to server
   */
  private async sendSubscriptionToServer(): Promise<void> {
    if (!this.subscription) {
      return;
    }

    try {
      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscription: this.subscription.toJSON(),
          userId: this.getCurrentUserId()
        })
      });
    } catch (error) {
      console.error('[PushNotification] Failed to send subscription to server:', error);
    }
  }

  /**
   * Get current user ID (implement based on your auth system)
   */
  private getCurrentUserId(): string {
    // This should be implemented based on your authentication system
    return localStorage.getItem('userId') || 'anonymous';
  }

  /**
   * Load notification preferences
   */
  private loadPreferences(): NotificationPreferences {
    const saved = localStorage.getItem('notificationPreferences');
    if (saved) {
      return JSON.parse(saved);
    }

    // Default preferences
    return {
      paymentConfirmed: true,
      paymentFailed: true,
      paymentProcessing: true,
      paymentConfirmationRequired: true,
      offlineStatus: true,
      marketingUpdates: false,
      soundEnabled: true,
      vibrationEnabled: true,
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '08:00'
      }
    };
  }

  /**
   * Save notification preferences
   */
  savePreferences(preferences: Partial<NotificationPreferences>): void {
    this.preferences = { ...this.preferences, ...preferences };
    localStorage.setItem('notificationPreferences', JSON.stringify(this.preferences));
  }

  /**
   * Get current preferences
   */
  getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe(): Promise<boolean> {
    if (this.subscription) {
      try {
        await this.subscription.unsubscribe();
        this.subscription = null;
        
        // Notify server
        await fetch('/api/notifications/unsubscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: this.getCurrentUserId()
          })
        });

        return true;
      } catch (error) {
        console.error('[PushNotification] Failed to unsubscribe:', error);
        return false;
      }
    }
    return true;
  }

  /**
   * Get subscription status
   */
  getSubscriptionStatus(): { subscribed: boolean; endpoint?: string } {
    return {
      subscribed: !!this.subscription,
      endpoint: this.subscription?.endpoint
    };
  }
}

export default PushNotificationService;
