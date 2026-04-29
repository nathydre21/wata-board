import express from 'express';
import { Pool } from 'pg';
import { ScheduledPaymentService } from '../services/scheduledPaymentService';
import { PaymentService } from '../payment-service';
import { EmailNotificationService } from '../services/emailNotificationService';
import { RateLimitConfig } from '../rate-limiter';
import logger from '../utils/logger';
import {
  sanitizeAlphanumeric,
  sanitizeString,
  sanitizePositiveNumber,
  validationError,
  type ValidationError,
} from '../utils/sanitize';
import { PaymentFrequency } from '../../shared/types';

const router = express.Router();

// Initialize services (these will be injected by the main server)
let scheduledPaymentService: ScheduledPaymentService;
let emailService: EmailNotificationService;

export function initializeScheduledPaymentsRoute(
  db: Pool,
  paymentService: PaymentService,
  emailNotificationService: EmailNotificationService,
  rateLimitConfig: RateLimitConfig
) {
  scheduledPaymentService = new ScheduledPaymentService(db, paymentService, emailNotificationService);
  emailService = emailNotificationService;
  
  // Start the scheduled payment processor
  scheduledPaymentService.start();
  
  logger.info('Scheduled payments route initialized');
}

/**
 * POST /api/scheduled-payments
 * Create a new payment schedule
 */
router.post('/', async (req, res) => {
  try {
    const {
      userId,
      meterId,
      amount,
      frequency,
      startDate,
      endDate,
      description,
      maxPayments
    } = req.body;

    // Validate inputs
    const errors: ValidationError[] = [];
    
    const sanitizedUserId = sanitizeAlphanumeric(userId, 100);
    if (!sanitizedUserId) {
      errors.push(validationError('userId', 'Valid user ID is required'));
    }

    const sanitizedMeterId = sanitizeAlphanumeric(meterId, 50);
    if (!sanitizedMeterId) {
      errors.push(validationError('meterId', 'Valid meter ID is required'));
    }

    const sanitizedAmount = sanitizePositiveNumber(amount);
    if (Number.isNaN(sanitizedAmount) || sanitizedAmount <= 0) {
      errors.push(validationError('amount', 'Amount must be a positive number'));
    }

    if (!Object.values(PaymentFrequency).includes(frequency)) {
      errors.push(validationError('frequency', 'Valid frequency is required'));
    }

    const sanitizedStartDate = sanitizeString(startDate, 50);
    if (!sanitizedStartDate) {
      errors.push(validationError('startDate', 'Start date is required'));
    }

    const start = new Date(sanitizedStartDate);
    if (isNaN(start.getTime()) || start <= new Date()) {
      errors.push(validationError('startDate', 'Start date must be in the future'));
    }

    let end: Date | undefined;
    if (endDate) {
      const sanitizedEndDate = sanitizeString(endDate, 50);
      if (sanitizedEndDate) {
        end = new Date(sanitizedEndDate);
        if (isNaN(end.getTime()) || end <= start) {
          errors.push(validationError('endDate', 'End date must be after start date'));
        }
      }
    }

    let maxPaymentsNum: number | undefined;
    if (maxPayments) {
      const sanitizedMaxPayments = sanitizePositiveNumber(maxPayments);
      if (!Number.isNaN(sanitizedMaxPayments) && sanitizedMaxPayments > 0) {
        maxPaymentsNum = sanitizedMaxPayments;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
        message: 'Invalid schedule data'
      });
    }

    // Create the payment schedule
    const scheduleId = await scheduledPaymentService.createPaymentSchedule({
      userId: sanitizedUserId,
      meterId: sanitizedMeterId,
      amount: sanitizedAmount,
      frequency: frequency as PaymentFrequency,
      startDate: start,
      endDate: end,
      description: sanitizeString(description, 500) || undefined,
      maxPayments: maxPaymentsNum
    });

    // Send confirmation email
    await emailService.sendEmail({
      userId: sanitizedUserId,
      paymentScheduleId: scheduleId,
      type: 'schedule_created',
      recipientEmail: await emailService.getUserEmail(sanitizedUserId) || '',
      subject: 'Payment Schedule Created - Wata Board',
      content: generateScheduleCreatedEmail(sanitizedAmount, sanitizedMeterId, frequency, start),
      metadata: { amount: sanitizedAmount, meterId: sanitizedMeterId, frequency, startDate: start }
    });

    logger.info('Payment schedule created', { 
      scheduleId, 
      userId: sanitizedUserId, 
      meterId: sanitizedMeterId 
    });

    return res.status(201).json({
      success: true,
      data: {
        scheduleId,
        userId: sanitizedUserId,
        meterId: sanitizedMeterId,
        amount: sanitizedAmount,
        frequency,
        startDate: start,
        endDate: end,
        description,
        maxPayments: maxPaymentsNum
      }
    });

  } catch (error) {
    logger.error('Failed to create payment schedule', { error, body: req.body });
    return res.status(500).json({
      success: false,
      error: 'Failed to create payment schedule'
    });
  }
});

/**
 * GET /api/scheduled-payments/:userId
 * Get all payment schedules for a user
 */
router.get('/:userId', async (req, res) => {
  try {
    const userId = sanitizeAlphanumeric(req.params.userId, 100);
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Valid user ID is required'
      });
    }

    const schedules = await scheduledPaymentService.getUserPaymentSchedules(userId);

    return res.status(200).json({
      success: true,
      data: schedules
    });

  } catch (error) {
    logger.error('Failed to get payment schedules', { error, userId: req.params.userId });
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve payment schedules'
    });
  }
});

/**
 * GET /api/scheduled-payments/:userId/:scheduleId
 * Get specific payment schedule with its scheduled payments
 */
router.get('/:userId/:scheduleId', async (req, res) => {
  try {
    const userId = sanitizeAlphanumeric(req.params.userId, 100);
    const scheduleId = sanitizeAlphanumeric(req.params.scheduleId, 100);

    if (!userId || !scheduleId) {
      return res.status(400).json({
        success: false,
        error: 'Valid user ID and schedule ID are required'
      });
    }

    const schedules = await scheduledPaymentService.getUserPaymentSchedules(userId);
    const schedule = schedules.find(s => s.id === scheduleId);

    if (!schedule) {
      return res.status(404).json({
        success: false,
        error: 'Payment schedule not found'
      });
    }

    const scheduledPayments = await scheduledPaymentService.getScheduledPayments(scheduleId, userId);

    return res.status(200).json({
      success: true,
      data: {
        ...schedule,
        scheduledPayments
      }
    });

  } catch (error) {
    logger.error('Failed to get payment schedule', { 
      error, 
      userId: req.params.userId, 
      scheduleId: req.params.scheduleId 
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve payment schedule'
    });
  }
});

/**
 * DELETE /api/scheduled-payments/:userId/:scheduleId
 * Cancel a payment schedule
 */
router.delete('/:userId/:scheduleId', async (req, res) => {
  try {
    const userId = sanitizeAlphanumeric(req.params.userId, 100);
    const scheduleId = sanitizeAlphanumeric(req.params.scheduleId, 100);

    if (!userId || !scheduleId) {
      return res.status(400).json({
        success: false,
        error: 'Valid user ID and schedule ID are required'
      });
    }

    const cancelled = await scheduledPaymentService.cancelPaymentSchedule(scheduleId, userId);

    if (!cancelled) {
      return res.status(404).json({
        success: false,
        error: 'Payment schedule not found or already cancelled'
      });
    }

    // Send cancellation email
    await emailService.sendEmail({
      userId,
      paymentScheduleId: scheduleId,
      type: 'schedule_cancelled',
      recipientEmail: await emailService.getUserEmail(userId) || '',
      subject: 'Payment Schedule Cancelled - Wata Board',
      content: generateScheduleCancelledEmail(scheduleId),
      metadata: { scheduleId }
    });

    logger.info('Payment schedule cancelled', { scheduleId, userId });

    return res.status(200).json({
      success: true,
      message: 'Payment schedule cancelled successfully'
    });

  } catch (error) {
    logger.error('Failed to cancel payment schedule', { 
      error, 
      userId: req.params.userId, 
      scheduleId: req.params.scheduleId 
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to cancel payment schedule'
    });
  }
});

/**
 * GET /api/scheduled-payments/:userId/notifications/history
 * Get email notification history for a user
 */
router.get('/:userId/notifications/history', async (req, res) => {
  try {
    const userId = sanitizeAlphanumeric(req.params.userId, 100);
    const limit = parseInt(req.query.limit as string) || 50;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Valid user ID is required'
      });
    }

    const history = await emailService.getEmailHistory(userId, Math.min(limit, 100));

    return res.status(200).json({
      success: true,
      data: history
    });

  } catch (error) {
    logger.error('Failed to get email history', { error, userId: req.params.userId });
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve email history'
    });
  }
});

/**
 * POST /api/scheduled-payments/:userId/notifications/test
 * Send a test email notification
 */
router.post('/:userId/notifications/test', async (req, res) => {
  try {
    const userId = sanitizeAlphanumeric(req.params.userId, 100);
    const { type } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Valid user ID is required'
      });
    }

    const userEmail = await emailService.getUserEmail(userId);
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'User email address not found'
      });
    }

    let emailRecord;
    switch (type) {
      case 'payment_success':
        emailRecord = await emailService.sendPaymentSuccessNotification(
          userId,
          'test-payment-id',
          'test-schedule-id',
          100.00,
          'TEST-001',
          'test-transaction-hash'
        );
        break;
      case 'payment_failed':
        emailRecord = await emailService.sendPaymentFailureNotification(
          userId,
          'test-payment-id',
          'test-schedule-id',
          100.00,
          'TEST-001',
          'Test error message'
        );
        break;
      case 'payment_reminder':
        emailRecord = await emailService.sendPaymentReminderNotification(
          userId,
          'test-schedule-id',
          100.00,
          'TEST-001',
          new Date(Date.now() + 24 * 60 * 60 * 1000) // Tomorrow
        );
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid notification type. Use: payment_success, payment_failed, or payment_reminder'
        });
    }

    logger.info('Test email sent', { userId, type });

    return res.status(200).json({
      success: true,
      message: 'Test email sent successfully',
      data: {
        emailId: emailRecord?.id,
        type,
        recipientEmail: userEmail
      }
    });

  } catch (error) {
    logger.error('Failed to send test email', { error, userId: req.params.userId });
    return res.status(500).json({
      success: false,
      error: 'Failed to send test email'
    });
  }
});

/**
 * Generate email content for schedule creation
 */
function generateScheduleCreatedEmail(
  amount: number,
  meterId: string,
  frequency: PaymentFrequency,
  startDate: Date
): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #10b981; color: white; padding: 20px; text-align: center;">
        <h1>Payment Schedule Created ✅</h1>
      </div>
      
      <div style="padding: 20px; background: #f9fafb;">
        <p>Hello,</p>
        <p>Your payment schedule has been successfully created:</p>
        
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Amount:</strong> $${amount.toFixed(2)}</p>
          <p><strong>Meter ID:</strong> ${meterId}</p>
          <p><strong>Frequency:</strong> ${frequency}</p>
          <p><strong>Start Date:</strong> ${startDate.toLocaleDateString()}</p>
        </div>
        
        <p>You will receive email notifications for each payment execution and reminders before due dates.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://wata-board.com/scheduled-payments" style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Manage Scheduled Payments
          </a>
        </div>
      </div>
      
      <div style="background: #e5e7eb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280;">
        <p>This is an automated message from Wata Board. Please do not reply to this email.</p>
      </div>
    </div>
  `;
}

/**
 * Generate email content for schedule cancellation
 */
function generateScheduleCancelledEmail(scheduleId: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #f59e0b; color: white; padding: 20px; text-align: center;">
        <h1>Payment Schedule Cancelled</h1>
      </div>
      
      <div style="padding: 20px; background: #f9fafb;">
        <p>Hello,</p>
        <p>Your payment schedule has been cancelled:</p>
        
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Schedule ID:</strong> ${scheduleId}</p>
          <p><strong>Cancelled Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>
        
        <p>No further payments will be processed for this schedule. You can create a new schedule at any time.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://wata-board.com/scheduled-payments" style="background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Create New Schedule
          </a>
        </div>
      </div>
      
      <div style="background: #e5e7eb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280;">
        <p>This is an automated message from Wata Board. Please do not reply to this email.</p>
      </div>
    </div>
  `;
}

export default router;
