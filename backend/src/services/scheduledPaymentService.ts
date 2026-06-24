import { Pool } from 'pg';
import { PaymentService } from '../payment-service';
import { EmailNotificationService } from './emailNotificationService';
import logger from '../utils/logger';
import { PaymentFrequency, PaymentStatus } from '../../shared/types';

export interface ScheduledPaymentTask {
  id: string;
  scheduleId: string;
  userId: string;
  meterId: string;
  amount: number;
  frequency: PaymentFrequency;
  scheduledDate: Date;
  maxPayments?: number;
  currentPaymentCount: number;
  endDate?: Date;
}

export interface ScheduledPaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  nextPaymentDate?: Date;
  scheduleCompleted: boolean;
}

export class ScheduledPaymentService {
  private db: Pool;
  private paymentService: PaymentService;
  private emailService: EmailNotificationService;
  private processingInterval: ReturnType<typeof setInterval> | null = null;
  private reminderInterval: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;

  constructor(db: Pool, paymentService: PaymentService, emailService: EmailNotificationService) {
    this.db = db;
    this.paymentService = paymentService;
    this.emailService = emailService;
  }

  /**
   * Start the scheduled payment processor
   */
  start(): void {
    if (this.processingInterval) {
      logger.warn('Scheduled payment processor is already running');
      return;
    }

    // Process due payments every minute
    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processDuePayments();
      }
    }, 60000); // 1 minute

    // Send reminders every hour
    this.reminderInterval = setInterval(async () => {
      await this.sendPaymentReminders();
    }, 3600000); // 1 hour

    logger.info('Scheduled payment processor started');
  }

  /**
   * Stop the scheduled payment processor
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    if (this.reminderInterval) {
      clearInterval(this.reminderInterval);
      this.reminderInterval = null;
    }

    logger.info('Scheduled payment processor stopped');
  }

  /**
   * Process all due scheduled payments
   */
  private async processDuePayments(): Promise<void> {
    this.isProcessing = true;

    try {
      const duePayments = await this.getDueScheduledPayments();
      
      if (duePayments.length === 0) {
        return;
      }

      logger.info(`Processing ${duePayments.length} due scheduled payments`);

      // Process payments in batches to avoid overwhelming the system
      const batchSize = 10;
      for (let i = 0; i < duePayments.length; i += batchSize) {
        const batch = duePayments.slice(i, i + batchSize);
        
        await Promise.allSettled(
          batch.map(payment => this.processScheduledPayment(payment))
        );

        // Small delay between batches
        if (i + batchSize < duePayments.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      logger.info(`Completed processing ${duePayments.length} scheduled payments`);
    } catch (error) {
      logger.error('Error processing scheduled payments', { error });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get all scheduled payments that are due
   */
  private async getDueScheduledPayments(): Promise<ScheduledPaymentTask[]> {
    const query = `
      SELECT 
        sp.id as scheduled_payment_id,
        ps.id as schedule_id,
        ps.user_id,
        ps.meter_id,
        ps.amount,
        ps.frequency,
        sp.scheduled_date,
        ps.max_payments,
        ps.current_payment_count,
        ps.end_date
      FROM scheduled_payments sp
      INNER JOIN payment_schedules ps ON sp.schedule_id = ps.id
      WHERE sp.status = 'pending'
      AND sp.scheduled_date <= NOW()
      AND ps.status = 'scheduled'
      ORDER BY sp.scheduled_date ASC
      LIMIT 100
    `;

    const result = await this.db.query(query);
    
    return result.rows.map(row => ({
      id: row.scheduled_payment_id,
      scheduleId: row.schedule_id,
      userId: row.user_id,
      meterId: row.meter_id,
      amount: parseFloat(row.amount),
      frequency: row.frequency as PaymentFrequency,
      scheduledDate: new Date(row.scheduled_date),
      maxPayments: row.max_payments ? parseInt(row.max_payments) : undefined,
      currentPaymentCount: parseInt(row.current_payment_count),
      endDate: row.end_date ? new Date(row.end_date) : undefined
    }));
  }

  /**
   * Process a single scheduled payment
   */
  private async processScheduledPayment(task: ScheduledPaymentTask): Promise<ScheduledPaymentResult> {
    const startTime = new Date();
    
    try {
      logger.info(`Processing scheduled payment ${task.id} for user ${task.userId}`, {
        scheduleId: task.scheduleId,
        meterId: task.meterId,
        amount: task.amount
      });

      // Update status to processing
      await this.updateScheduledPaymentStatus(task.id, PaymentStatus.PROCESSING);

      // Execute the payment using existing payment service
      const paymentRequest = {
        meter_id: task.meterId,
        amount: task.amount,
        userId: task.userId,
        memo: `Scheduled payment ${task.scheduleId}`
      };

      const paymentResult = await this.paymentService.processPayment(paymentRequest);

      if (paymentResult.success) {
        // Payment successful
        await this.handleSuccessfulPayment(task, paymentResult.transactionId!);
        
        // Send success email notification
        await this.emailService.sendPaymentSuccessNotification(
          task.userId,
          task.id,
          task.scheduleId,
          task.amount,
          task.meterId,
          paymentResult.transactionId
        );

        logger.info(`Scheduled payment ${task.id} completed successfully`, {
          transactionId: paymentResult.transactionId,
          processingTime: Date.now() - startTime.getTime()
        });

        return {
          success: true,
          transactionId: paymentResult.transactionId,
          scheduleCompleted: await this.isScheduleCompleted(task.scheduleId)
        };
      } else {
        // Payment failed
        await this.handleFailedPayment(task, paymentResult.error || 'Unknown error');
        
        // Send failure email notification
        await this.emailService.sendPaymentFailureNotification(
          task.userId,
          task.id,
          task.scheduleId,
          task.amount,
          task.meterId,
          paymentResult.error
        );

        logger.warn(`Scheduled payment ${task.id} failed`, {
          error: paymentResult.error,
          processingTime: Date.now() - startTime.getTime()
        });

        return {
          success: false,
          error: paymentResult.error,
          scheduleCompleted: false
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Handle unexpected errors
      await this.handleFailedPayment(task, errorMessage);
      
      logger.error(`Unexpected error processing scheduled payment ${task.id}`, {
        error: errorMessage,
        processingTime: Date.now() - startTime.getTime()
      });

      return {
        success: false,
        error: errorMessage,
        scheduleCompleted: false
      };
    }
  }

  /**
   * Handle successful scheduled payment
   */
  private async handleSuccessfulPayment(task: ScheduledPaymentTask, transactionId: string): Promise<void> {
    await this.db.query('BEGIN');

    try {
      // Update scheduled payment record
      const updateQuery = `
        UPDATE scheduled_payments 
        SET status = 'completed', 
            actual_payment_date = NOW(),
            transaction_hash = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `;
      await this.db.query(updateQuery, [transactionId, task.id]);

      // Update payment schedule
      await this.updatePaymentScheduleAfterPayment(task.scheduleId);

      await this.db.query('COMMIT');
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Handle failed scheduled payment
   */
  private async handleFailedPayment(task: ScheduledPaymentTask, errorMessage: string): Promise<void> {
    await this.db.query('BEGIN');

    try {
      // Get current retry count
      const retryQuery = `
        SELECT retry_count FROM scheduled_payments WHERE id = $1
      `;
      const retryResult = await this.db.query(retryQuery, [task.id]);
      const currentRetryCount = retryResult.rows[0]?.retry_count || 0;
      const maxRetries = 3; // Configurable

      if (currentRetryCount >= maxRetries) {
        // Max retries reached, mark as failed
        const updateQuery = `
          UPDATE scheduled_payments 
          SET status = 'failed', 
              error_message = $1,
              retry_count = retry_count + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `;
        await this.db.query(updateQuery, [errorMessage, task.id]);
      } else {
        // Increment retry count and keep as pending for retry
        const updateQuery = `
          UPDATE scheduled_payments 
          SET status = 'pending', 
              error_message = $1,
              retry_count = retry_count + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `;
        await this.db.query(updateQuery, [errorMessage, task.id]);
      }

      await this.db.query('COMMIT');
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Update payment schedule after successful payment
   */
  private async updatePaymentScheduleAfterPayment(scheduleId: string): Promise<void> {
    // Update current payment count
    const updateCountQuery = `
      UPDATE payment_schedules 
      SET current_payment_count = current_payment_count + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    await this.db.query(updateCountQuery, [scheduleId]);

    // Get schedule details to determine next action
    const scheduleQuery = `
      SELECT * FROM payment_schedules WHERE id = $1
    `;
    const scheduleResult = await this.db.query(scheduleQuery, [scheduleId]);
    const schedule = scheduleResult.rows[0];

    if (!schedule) {
      return;
    }

    // Check if schedule should be completed
    const shouldComplete = 
      (schedule.max_payments && schedule.current_payment_count >= schedule.max_payments) ||
      (schedule.end_date && new Date(schedule.next_payment_date) > new Date(schedule.end_date));

    if (shouldComplete) {
      // Mark schedule as completed
      await this.db.query(`
        UPDATE payment_schedules 
        SET status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [scheduleId]);
    } else {
      // Calculate and update next payment date
      await this.calculateNextPaymentDate(scheduleId);
    }
  }

  /**
   * Calculate next payment date for a schedule
   */
  private async calculateNextPaymentDate(scheduleId: string): Promise<void> {
    const query = `
      SELECT update_schedule_next_payment_date($1)
    `;
    await this.db.query(query, [scheduleId]);
  }

  /**
   * Update scheduled payment status
   */
  private async updateScheduledPaymentStatus(
    scheduledPaymentId: string, 
    status: PaymentStatus
  ): Promise<void> {
    const query = `
      UPDATE scheduled_payments 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;
    await this.db.query(query, [status, scheduledPaymentId]);
  }

  /**
   * Check if a schedule is completed
   */
  private async isScheduleCompleted(scheduleId: string): Promise<boolean> {
    const query = `
      SELECT status FROM payment_schedules WHERE id = $1
    `;
    const result = await this.db.query(query, [scheduleId]);
    return result.rows[0]?.status === 'completed';
  }

  /**
   * Send payment reminders for upcoming payments
   */
  private async sendPaymentReminders(): Promise<void> {
    try {
      // Get upcoming payments that need reminders
      const reminderQuery = `
        SELECT DISTINCT ON (ps.user_id, ps.id)
          ps.id as schedule_id,
          ps.user_id,
          ps.meter_id,
          ps.amount,
          sp.scheduled_date,
          ns.reminder_days,
          ns.reminder_notification
        FROM payment_schedules ps
        INNER JOIN scheduled_payments sp ON ps.id = sp.schedule_id
        INNER JOIN notification_settings ns ON ps.user_id = ns.user_id
        WHERE ps.status = 'scheduled'
        AND sp.status = 'pending'
        AND sp.scheduled_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
        AND ns.reminder_notification = true
        AND NOT EXISTS (
          SELECT 1 FROM email_notifications en
          WHERE en.payment_schedule_id = ps.id
          AND en.type = 'payment_reminder'
          AND en.created_at > sp.scheduled_date - INTERVAL '1 day'
        )
        ORDER BY ps.user_id, ps.id, sp.scheduled_date ASC
      `;

      const result = await this.db.query(reminderQuery);
      
      for (const reminder of result.rows) {
        const reminderDays = reminder.reminder_days || [1, 3, 7];
        const scheduledDate = new Date(reminder.scheduled_date);
        const daysUntilPayment = Math.ceil((scheduledDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        if (reminderDays.includes(daysUntilPayment)) {
          await this.emailService.sendPaymentReminderNotification(
            reminder.user_id,
            reminder.schedule_id,
            parseFloat(reminder.amount),
            reminder.meter_id,
            scheduledDate
          );
        }
      }

      if (result.rows.length > 0) {
        logger.info(`Sent ${result.rows.length} payment reminders`);
      }
    } catch (error) {
      logger.error('Error sending payment reminders', { error });
    }
  }

  /**
   * Create a new payment schedule
   */
  async createPaymentSchedule(scheduleData: {
    userId: string;
    meterId: string;
    amount: number;
    frequency: PaymentFrequency;
    startDate: Date;
    endDate?: Date;
    description?: string;
    maxPayments?: number;
  }): Promise<string> {
    const query = `
      INSERT INTO payment_schedules (
        user_id, meter_id, amount, frequency, start_date, end_date,
        next_payment_date, description, max_payments
      ) VALUES ($1, $2, $3, $4, $5, $6, $5, $7, $8)
      RETURNING id
    `;

    const values = [
      scheduleData.userId,
      scheduleData.meterId,
      scheduleData.amount,
      scheduleData.frequency,
      scheduleData.startDate,
      scheduleData.endDate || null,
      scheduleData.description || null,
      scheduleData.maxPayments || null
    ];

    const result = await this.db.query(query, values);
    const scheduleId = result.rows[0].id;

    // Create the first scheduled payment
    await this.createScheduledPayment(scheduleId, scheduleData.startDate);

    logger.info(`Created payment schedule ${scheduleId} for user ${scheduleData.userId}`);
    return scheduleId;
  }

  /**
   * Create a scheduled payment instance
   */
  private async createScheduledPayment(scheduleId: string, scheduledDate: Date): Promise<void> {
    // Get schedule details
    const scheduleQuery = `
      SELECT amount FROM payment_schedules WHERE id = $1
    `;
    const scheduleResult = await this.db.query(scheduleQuery, [scheduleId]);
    const schedule = scheduleResult.rows[0];

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    const query = `
      INSERT INTO scheduled_payments (schedule_id, amount, scheduled_date, status)
      VALUES ($1, $2, $3, 'pending')
    `;

    await this.db.query(query, [scheduleId, schedule.amount, scheduledDate]);
  }

  /**
   * Cancel a payment schedule
   */
  async cancelPaymentSchedule(scheduleId: string, userId: string): Promise<boolean> {
    const query = `
      UPDATE payment_schedules 
      SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;

    const result = await this.db.query(query, [scheduleId, userId]);
    
    if (result.rows.length > 0) {
      // Cancel all pending scheduled payments for this schedule
      await this.db.query(`
        UPDATE scheduled_payments 
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE schedule_id = $1 AND status = 'pending'
      `, [scheduleId]);

      logger.info(`Cancelled payment schedule ${scheduleId} for user ${userId}`);
      return true;
    }

    return false;
  }

  /**
   * Get payment schedules for a user
   */
  async getUserPaymentSchedules(userId: string): Promise<any[]> {
    const query = `
      SELECT 
        ps.*,
        COUNT(sp.id) as total_payments,
        COUNT(CASE WHEN sp.status = 'completed' THEN 1 END) as completed_payments
      FROM payment_schedules ps
      LEFT JOIN scheduled_payments sp ON ps.id = sp.schedule_id
      WHERE ps.user_id = $1
      GROUP BY ps.id
      ORDER BY ps.created_at DESC
    `;

    const result = await this.db.query(query, [userId]);
    return result.rows;
  }

  /**
   * Get scheduled payments for a schedule
   */
  async getScheduledPayments(scheduleId: string, userId: string): Promise<any[]> {
    const query = `
      SELECT * FROM scheduled_payments 
      WHERE schedule_id = $1
      AND EXISTS (
        SELECT 1 FROM payment_schedules ps 
        WHERE ps.id = $1 AND ps.user_id = $2
      )
      ORDER BY scheduled_date DESC
    `;

    const result = await this.db.query(query, [scheduleId, userId]);
    return result.rows;
  }
}

export default ScheduledPaymentService;
