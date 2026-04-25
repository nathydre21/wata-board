import express from 'express';
import webpush from 'web-push';
import logger from '../utils/logger';
import {
  sanitizeAlphanumeric,
  sanitizeString,
  validationError,
  type ValidationError,
} from '../utils/sanitize';

const router = express.Router();

// VAPID keys (in production, these should be stored securely)
const VAPID_PUBLIC_KEY = 'BMxzFTLdK7yVdQ3kL8X8Q2rXJ3h8yN7k5Q2rXJ3h8yN7k5Q';
const VAPID_PRIVATE_KEY = 'your-private-key-here'; // Replace with actual private key
const VAPID_EMAIL = 'support@wata-board.com';

// In-memory storage for subscriptions (in production, use a database)
const subscriptions = new Map<string, webpush.PushSubscription>();

/**
 * POST /api/notifications/subscribe
 * Register a new push subscription
 */
router.post('/subscribe', async (req, res) => {
  try {
    const { subscription, userId } = req.body;

    // Validate inputs
    const errors: ValidationError[] = [];
    
    if (!userId || !sanitizeAlphanumeric(userId, 100)) {
      errors.push(validationError('userId', 'Valid user ID is required'));
    }
    
    if (!subscription || !subscription.endpoint) {
      errors.push(validationError('subscription', 'Valid push subscription is required'));
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
        message: 'Invalid subscription data'
      });
    }

    // Store subscription
    const subscriptionKey = `${userId}-${subscription.endpoint}`;
    subscriptions.set(subscriptionKey, subscription);

    logger.info('Push subscription registered', { 
      userId, 
      endpoint: subscription.endpoint 
    });

    return res.status(200).json({
      success: true,
      message: 'Subscription registered successfully'
    });
  } catch (error) {
    logger.error('Failed to register push subscription', { error });
    return res.status(500).json({
      success: false,
      error: 'Failed to register subscription'
    });
  }
});

/**
 * POST /api/notifications/unsubscribe
 * Remove a push subscription
 */
router.post('/unsubscribe', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId || !sanitizeAlphanumeric(userId, 100)) {
      return res.status(400).json({
        success: false,
        error: 'Valid user ID is required'
      });
    }

    // Remove all subscriptions for user
    const keysToRemove = [];
    for (const [key, subscription] of subscriptions.entries()) {
      if (key.startsWith(userId)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => subscriptions.delete(key));

    logger.info('Push subscriptions removed', { userId, count: keysToRemove.length });

    return res.status(200).json({
      success: true,
      message: 'Subscriptions removed successfully'
    });
  } catch (error) {
    logger.error('Failed to unsubscribe', { error });
    return res.status(500).json({
      success: false,
      error: 'Failed to unsubscribe'
    });
  }
});

/**
 * POST /api/notifications/push
 * Send a push notification
 */
router.post('/push', async (req, res) => {
  try {
    const { userId, type, title, body, data, icon, badge, tag } = req.body;

    // Validate inputs
    const errors: ValidationError[] = [];
    
    if (!userId || !sanitizeAlphanumeric(userId, 100)) {
      errors.push(validationError('userId', 'Valid user ID is required'));
    }
    
    if (!type || !sanitizeAlphanumeric(type, 50)) {
      errors.push(validationError('type', 'Valid notification type is required'));
    }

    if (!title || !sanitizeString(title, 100)) {
      errors.push(validationError('title', 'Valid title is required'));
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
        message: 'Invalid notification data'
      });
    }

    // Find user's subscriptions
    const userSubscriptions = [];
    for (const [key, subscription] of subscriptions.entries()) {
      if (key.startsWith(userId)) {
        userSubscriptions.push(subscription);
      }
    }

    if (userSubscriptions.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No subscriptions found for user'
      });
    }

    // Prepare notification payload
    const payload = JSON.stringify({
      type,
      title,
      body: body || 'Payment status update',
      data: data || {},
      icon: icon || '/icon-192x192.png',
      badge: badge || '/notification-badge.png',
      tag: tag || `payment-${type}`,
      timestamp: new Date().toISOString()
    });

    // Send to all user's subscriptions
    const results = await Promise.allSettled(
      userSubscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(subscription, payload, {
            vapidDetails: {
              subject: VAPID_EMAIL,
              publicKey: VAPID_PUBLIC_KEY,
              privateKey: VAPID_PRIVATE_KEY,
            },
            TTL: 24 * 60 * 60, // 24 hours
            urgency: type === 'payment-failed' ? 'high' : 'normal'
          });
          return { success: true, endpoint: subscription.endpoint };
        } catch (error) {
          logger.error('Push notification failed', { 
            error, 
            endpoint: subscription.endpoint 
          });
          
          // Remove invalid subscription
          if (error.statusCode === 410 || error.statusCode === 404) {
            const keysToRemove = [];
            for (const [key, sub] of subscriptions.entries()) {
              if (sub.endpoint === subscription.endpoint) {
                keysToRemove.push(key);
              }
            }
            keysToRemove.forEach(key => subscriptions.delete(key));
          }
          
          return { success: false, error, endpoint: subscription.endpoint };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'rejected' || !r.value.success).length;

    logger.info('Push notifications sent', { 
      userId, 
      total: userSubscriptions.length,
      successful,
      failed,
      type 
    });

    return res.status(200).json({
      success: successful > 0,
      data: {
        sent: userSubscriptions.length,
        successful,
        failed
      }
    });
  } catch (error) {
    logger.error('Failed to send push notification', { error });
    return res.status(500).json({
      success: false,
      error: 'Failed to send push notification'
    });
  }
});

/**
 * POST /api/notifications/payment-status
 * Send payment status update notification
 */
router.post('/payment-status', async (req, res) => {
  try {
    const { userId, transactionId, status, paymentData } = req.body;

    // Validate inputs
    const errors: ValidationError[] = [];
    
    if (!userId || !sanitizeAlphanumeric(userId, 100)) {
      errors.push(validationError('userId', 'Valid user ID is required'));
    }
    
    if (!transactionId || !sanitizeAlphanumeric(transactionId, 100)) {
      errors.push(validationError('transactionId', 'Valid transaction ID is required'));
    }
    
    if (!status || !sanitizeAlphanumeric(status, 50)) {
      errors.push(validationError('status', 'Valid status is required'));
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
        message: 'Invalid payment status data'
      });
    }

    // Map status to notification type and content
    const notificationData = mapPaymentStatusToNotification(status, paymentData);
    
    // Send push notification
    const pushResponse = await fetch(`${req.protocol}://${req.get('host')}/api/notifications/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        ...notificationData
      })
    });

    if (pushResponse.ok) {
      logger.info('Payment status notification sent', { 
        userId, 
        transactionId, 
        status,
        type: notificationData.type 
      });
    } else {
      logger.error('Failed to send payment status notification', { 
        userId, 
        transactionId, 
        status 
      });
    }

    return res.status(pushResponse.ok ? 200 : 500).json({
      success: pushResponse.ok,
      message: pushResponse.ok ? 'Notification sent successfully' : 'Failed to send notification'
    });
  } catch (error) {
    logger.error('Payment status notification failed', { error });
    return res.status(500).json({
      success: false,
      error: 'Failed to send payment status notification'
    });
  }
});

/**
 * GET /api/notifications/subscriptions/:userId
 * Get all subscriptions for a user (admin endpoint)
 */
router.get('/subscriptions/:userId', async (req, res) => {
  try {
    const userId = sanitizeAlphanumeric(req.params.userId, 100);
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Valid user ID is required'
      });
    }

    // Get user's subscriptions
    const userSubscriptions = [];
    for (const [key, subscription] of subscriptions.entries()) {
      if (key.startsWith(userId)) {
        userSubscriptions.push({
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          expirationTime: subscription.expirationTime
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        userId,
        subscriptions: userSubscriptions,
        count: userSubscriptions.length
      }
    });
  } catch (error) {
    logger.error('Failed to get subscriptions', { error });
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve subscriptions'
    });
  }
});

/**
 * GET /api/notifications/vapid-public-key
 * Get VAPID public key for client registration
 */
router.get('/vapid-public-key', (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      publicKey: VAPID_PUBLIC_KEY
    }
  });
});

/**
 * Map payment status to notification data
 */
function mapPaymentStatusToNotification(status: string, paymentData?: any) {
  const amount = paymentData?.amount;
  const meterId = paymentData?.meterId;
  const error = paymentData?.error;

  switch (status.toLowerCase()) {
    case 'confirmed':
    case 'completed':
      return {
        type: 'payment-confirmed',
        title: 'Payment Successful! ✅',
        body: `Your payment of ${amount ? formatCurrency(amount) : ''} for meter ${meterId || ''} has been confirmed.`,
        data: {
          transactionId: paymentData?.transactionId,
          meterId,
          amount,
          status: 'confirmed'
        },
        actions: [
          { action: 'view-receipt', title: 'View Receipt', icon: '/receipt-icon.png' },
          { action: 'view-details', title: 'View Details', icon: '/details-icon.png' }
        ]
      };

    case 'failed':
    case 'error':
      return {
        type: 'payment-failed',
        title: 'Payment Failed ❌',
        body: `Payment failed: ${error || 'Unknown error'}. Please try again.`,
        data: {
          transactionId: paymentData?.transactionId,
          meterId,
          amount,
          status: 'failed',
          error
        },
        actions: [
          { action: 'retry-payment', title: 'Retry Payment', icon: '/retry-icon.png' },
          { action: 'view-error', title: 'View Error', icon: '/error-icon.png' }
        ]
      };

    case 'processing':
    case 'pending':
      return {
        type: 'payment-processing',
        title: 'Payment Processing... ⏳',
        body: `Your payment of ${amount ? formatCurrency(amount) : ''} for meter ${meterId || ''} is being processed.`,
        data: {
          transactionId: paymentData?.transactionId,
          meterId,
          amount,
          status: 'processing'
        },
        actions: [
          { action: 'track-payment', title: 'Track Payment', icon: '/track-icon.png' }
        ]
      };

    case 'confirmation_required':
      return {
        type: 'payment-confirmation-required',
        title: 'Action Required ⚠️',
        body: `Please confirm your payment of ${amount ? formatCurrency(amount) : ''} for meter ${meterId || ''}.`,
        data: {
          transactionId: paymentData?.transactionId,
          meterId,
          amount,
          status: 'confirmation_required'
        },
        actions: [
          { action: 'confirm-payment', title: 'Confirm Payment', icon: '/confirm-icon.png' },
          { action: 'cancel-payment', title: 'Cancel', icon: '/cancel-icon.png' }
        ]
      };

    default:
      return {
        type: 'payment-processing',
        title: 'Payment Update',
        body: `Payment status updated to ${status}`,
        data: {
          transactionId: paymentData?.transactionId,
          meterId,
          amount,
          status
        }
      };
  }
}

/**
 * Format currency amount
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

export default router;
