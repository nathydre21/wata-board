import nodemailer from 'nodemailer';
import { envConfig } from '../utils/env';
import logger from '../utils/logger';
import { Pool } from 'pg';

export interface EmailNotificationPayload {
  userId: string;
  scheduledPaymentId?: string;
  paymentScheduleId?: string;
  type: 'payment_success' | 'payment_failed' | 'payment_reminder' | 'schedule_created' | 'schedule_cancelled' | 'schedule_paused' | 'schedule_resumed';
  recipientEmail: string;
  subject: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface EmailNotificationRecord {
  id: string;
  userId: string;
  scheduledPaymentId?: string;
  paymentScheduleId?: string;
  type: string;
  recipientEmail: string;
  subject: string;
  content: string;
  status: 'pending' | 'sent' | 'failed';
  sentAt?: Date;
  errorMessage?: string;
  createdAt: Date;
  metadata: Record<string, any>;
}

export class EmailNotificationService {
  private transporter: nodemailer.Transporter;
  private db: Pool;
  private isEnabled: boolean;

  constructor(db: Pool) {
    this.db = db;
    this.isEnabled = envConfig.EMAIL_NOTIFICATION_ENABLED === 'true';
    
    if (this.isEnabled) {
      this.initializeTransporter();
    } else {
      logger.warn('Email notifications are disabled');
      // Create a mock transporter for testing
      this.transporter = nodemailer.createTransporter({
        sendMail: async (options) => {
          logger.info('Mock email sent:', { subject: options.subject, to: options.to });
          return { messageId: 'mock-' + Date.now() } as any;
        }
      } as any);
    }
  }

  private initializeTransporter(): void {
    const config = {
      host: envConfig.EMAIL_HOST,
      port: parseInt(envConfig.EMAIL_PORT || '587'),
      secure: envConfig.EMAIL_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: envConfig.EMAIL_USER,
        pass: envConfig.EMAIL_PASSWORD,
      },
    };

    this.transporter = nodemailer.createTransporter(config);

    // Verify connection configuration
    this.transporter.verify((error, success) => {
      if (error) {
        logger.error('Email service configuration error:', error);
        this.isEnabled = false;
      } else {
        logger.info('Email service is ready to send messages');
      }
    });
  }

  /**
   * Send email notification and record in database
   */
  async sendEmail(payload: EmailNotificationPayload): Promise<EmailNotificationRecord> {
    if (!this.isEnabled) {
      logger.warn('Email notifications disabled, skipping email send', {
        type: payload.type,
        userId: payload.userId,
      });
      return this.createEmailRecord(payload, 'sent');
    }

    // Record the email in database first
    const emailRecord = await this.createEmailRecord(payload, 'pending');

    try {
      const mailOptions = {
        from: `"${envConfig.EMAIL_FROM_NAME || 'Wata Board'}" <${envConfig.EMAIL_FROM_ADDRESS || 'noreply@wata-board.com'}>`,
        to: payload.recipientEmail,
        subject: payload.subject,
        html: payload.content,
        text: this.stripHtml(payload.content),
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info('Email sent successfully', {
        messageId: info.messageId,
        type: payload.type,
        userId: payload.userId,
        recipientEmail: payload.recipientEmail,
      });

      // Update record as sent
      return await this.updateEmailRecord(emailRecord.id, 'sent', undefined, new Date());
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to send email', {
        error: errorMessage,
        type: payload.type,
        userId: payload.userId,
        recipientEmail: payload.recipientEmail,
      });

      // Update record as failed
      return await this.updateEmailRecord(emailRecord.id, 'failed', errorMessage);
    }
  }

  /**
   * Create email record in database
   */
  private async createEmailRecord(
    payload: EmailNotificationPayload,
    status: 'pending' | 'sent' | 'failed'
  ): Promise<EmailNotificationRecord> {
    const query = `
      INSERT INTO email_notifications (
        user_id, scheduled_payment_id, payment_schedule_id, type, recipient_email, 
        subject, content, status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      payload.userId,
      payload.scheduledPaymentId || null,
      payload.paymentScheduleId || null,
      payload.type,
      payload.recipientEmail,
      payload.subject,
      payload.content,
      status,
      JSON.stringify(payload.metadata || {})
    ];

    const result = await this.db.query(query, values);
    return this.mapDbRowToEmailRecord(result.rows[0]);
  }

  /**
   * Update email record status
   */
  private async updateEmailRecord(
    id: string,
    status: 'pending' | 'sent' | 'failed',
    errorMessage?: string,
    sentAt?: Date
  ): Promise<EmailNotificationRecord> {
    const query = `
      UPDATE email_notifications 
      SET status = $1, error_message = $2, sent_at = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;

    const values = [status, errorMessage || null, sentAt || null, id];
    const result = await this.db.query(query, values);
    return this.mapDbRowToEmailRecord(result.rows[0]);
  }

  /**
   * Get email notification history for a user
   */
  async getEmailHistory(userId: string, limit = 50): Promise<EmailNotificationRecord[]> {
    const query = `
      SELECT * FROM email_notifications 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;

    const result = await this.db.query(query, [userId, limit]);
    return result.rows.map(row => this.mapDbRowToEmailRecord(row));
  }

  /**
   * Get pending emails that need to be retried
   */
  async getPendingEmails(): Promise<EmailNotificationRecord[]> {
    const query = `
      SELECT * FROM email_notifications 
      WHERE status = 'pending' 
      AND created_at < NOW() - INTERVAL '5 minutes'
      ORDER BY created_at ASC
      LIMIT 50
    `;

    const result = await this.db.query(query);
    return result.rows.map(row => this.mapDbRowToEmailRecord(row));
  }

  /**
   * Retry sending failed emails
   */
  async retryFailedEmails(): Promise<number> {
    const pendingEmails = await this.getPendingEmails();
    let retriedCount = 0;

    for (const email of pendingEmails) {
      try {
        const mailOptions = {
          from: `"${envConfig.EMAIL_FROM_NAME || 'Wata Board'}" <${envConfig.EMAIL_FROM_ADDRESS || 'noreply@wata-board.com'}>`,
          to: email.recipientEmail,
          subject: email.subject,
          html: email.content,
          text: this.stripHtml(email.content),
        };

        await this.transporter.sendMail(mailOptions);
        
        await this.updateEmailRecord(email.id, 'sent', undefined, new Date());
        retriedCount++;
        
        logger.info('Email retry successful', { emailId: email.id });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.updateEmailRecord(email.id, 'failed', errorMessage);
        
        logger.error('Email retry failed', { 
          emailId: email.id, 
          error: errorMessage 
        });
      }
    }

    return retriedCount;
  }

  /**
   * Check if user has email notifications enabled
   */
  async isEmailEnabledForUser(userId: string): Promise<boolean> {
    const query = `
      SELECT email_enabled FROM notification_settings 
      WHERE user_id = $1
    `;

    const result = await this.db.query(query, [userId]);
    
    if (result.rows.length === 0) {
      // Default to enabled if no settings exist
      return true;
    }

    return result.rows[0].email_enabled;
  }

  /**
   * Get user's email address
   */
  async getUserEmail(userId: string): Promise<string | null> {
    const query = `
      SELECT email FROM users 
      WHERE id = $1
    `;

    const result = await this.db.query(query, [userId]);
    return result.rows[0]?.email || null;
  }

  /**
   * Strip HTML tags for plain text version
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Map database row to EmailNotificationRecord
   */
  private mapDbRowToEmailRecord(row: any): EmailNotificationRecord {
    return {
      id: row.id,
      userId: row.user_id,
      scheduledPaymentId: row.scheduled_payment_id,
      paymentScheduleId: row.payment_schedule_id,
      type: row.type,
      recipientEmail: row.recipient_email,
      subject: row.subject,
      content: row.content,
      status: row.status,
      sentAt: row.sent_at,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      metadata: row.metadata || {},
    };
  }

  /**
   * Send payment success notification
   */
  async sendPaymentSuccessNotification(
    userId: string,
    scheduledPaymentId: string,
    paymentScheduleId: string,
    amount: number,
    meterId: string,
    transactionHash?: string
  ): Promise<EmailNotificationRecord | null> {
    const emailEnabled = await this.isEmailEnabledForUser(userId);
    if (!emailEnabled) {
      return null;
    }

    const userEmail = await this.getUserEmail(userId);
    if (!userEmail) {
      logger.warn('No email address found for user', { userId });
      return null;
    }

    const { subject, content } = this.generatePaymentSuccessEmail(amount, meterId, transactionHash);

    return this.sendEmail({
      userId,
      scheduledPaymentId,
      paymentScheduleId,
      type: 'payment_success',
      recipientEmail: userEmail,
      subject,
      content,
      metadata: { amount, meterId, transactionHash }
    });
  }

  /**
   * Send payment failure notification
   */
  async sendPaymentFailureNotification(
    userId: string,
    scheduledPaymentId: string,
    paymentScheduleId: string,
    amount: number,
    meterId: string,
    errorMessage?: string
  ): Promise<EmailNotificationRecord | null> {
    const emailEnabled = await this.isEmailEnabledForUser(userId);
    if (!emailEnabled) {
      return null;
    }

    const userEmail = await this.getUserEmail(userId);
    if (!userEmail) {
      logger.warn('No email address found for user', { userId });
      return null;
    }

    const { subject, content } = this.generatePaymentFailureEmail(amount, meterId, errorMessage);

    return this.sendEmail({
      userId,
      scheduledPaymentId,
      paymentScheduleId,
      type: 'payment_failed',
      recipientEmail: userEmail,
      subject,
      content,
      metadata: { amount, meterId, errorMessage }
    });
  }

  /**
   * Send payment reminder notification
   */
  async sendPaymentReminderNotification(
    userId: string,
    paymentScheduleId: string,
    amount: number,
    meterId: string,
    scheduledDate: Date
  ): Promise<EmailNotificationRecord | null> {
    const emailEnabled = await this.isEmailEnabledForUser(userId);
    if (!emailEnabled) {
      return null;
    }

    const userEmail = await this.getUserEmail(userId);
    if (!userEmail) {
      logger.warn('No email address found for user', { userId });
      return null;
    }

    const { subject, content } = this.generatePaymentReminderEmail(amount, meterId, scheduledDate);

    return this.sendEmail({
      userId,
      paymentScheduleId,
      type: 'payment_reminder',
      recipientEmail: userEmail,
      subject,
      content,
      metadata: { amount, meterId, scheduledDate }
    });
  }

  /**
   * Generate payment success email content
   */
  private generatePaymentSuccessEmail(
    amount: number,
    meterId: string,
    transactionHash?: string
  ): { subject: string; content: string } {
    const subject = 'Payment Successful - Wata Board';
    
    const content = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #10b981; color: white; padding: 20px; text-align: center;">
          <h1>Payment Successful! ✅</h1>
        </div>
        
        <div style="padding: 20px; background: #f9fafb;">
          <p>Hello,</p>
          <p>Your scheduled payment has been successfully processed:</p>
          
          <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Amount:</strong> $${amount.toFixed(2)}</p>
            <p><strong>Meter ID:</strong> ${meterId}</p>
            ${transactionHash ? `<p><strong>Transaction:</strong> ${transactionHash}</p>` : ''}
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
          
          <p>Thank you for using Wata Board for your utility payments.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://wata-board.com/payments" style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              View Payment History
            </a>
          </div>
        </div>
        
        <div style="background: #e5e7eb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280;">
          <p>This is an automated message from Wata Board. Please do not reply to this email.</p>
        </div>
      </div>
    `;

    return { subject, content };
  }

  /**
   * Generate payment failure email content
   */
  private generatePaymentFailureEmail(
    amount: number,
    meterId: string,
    errorMessage?: string
  ): { subject: string; content: string } {
    const subject = 'Payment Failed - Action Required - Wata Board';
    
    const content = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #ef4444; color: white; padding: 20px; text-align: center;">
          <h1>Payment Failed ❌</h1>
        </div>
        
        <div style="padding: 20px; background: #f9fafb;">
          <p>Hello,</p>
          <p>We were unable to process your scheduled payment:</p>
          
          <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Amount:</strong> $${amount.toFixed(2)}</p>
            <p><strong>Meter ID:</strong> ${meterId}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            ${errorMessage ? `<p><strong>Error:</strong> ${errorMessage}</p>` : ''}
          </div>
          
          <p>Please check your payment method and try again. The system will automatically retry the payment.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://wata-board.com/payments" style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              Review Payment
            </a>
          </div>
        </div>
        
        <div style="background: #e5e7eb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280;">
          <p>This is an automated message from Wata Board. Please do not reply to this email.</p>
        </div>
      </div>
    `;

    return { subject, content };
  }

  /**
   * Generate payment reminder email content
   */
  private generatePaymentReminderEmail(
    amount: number,
    meterId: string,
    scheduledDate: Date
  ): { subject: string; content: string } {
    const subject = 'Payment Reminder - Wata Board';
    
    const content = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #f59e0b; color: white; padding: 20px; text-align: center;">
          <h1>Payment Reminder ⏰</h1>
        </div>
        
        <div style="padding: 20px; background: #f9fafb;">
          <p>Hello,</p>
          <p>This is a reminder that you have a scheduled payment coming up:</p>
          
          <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Amount:</strong> $${amount.toFixed(2)}</p>
            <p><strong>Meter ID:</strong> ${meterId}</p>
            <p><strong>Scheduled Date:</strong> ${scheduledDate.toLocaleDateString()}</p>
          </div>
          
          <p>Please ensure you have sufficient funds in your account.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://wata-board.com/scheduled-payments" style="background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              Manage Scheduled Payments
            </a>
          </div>
        </div>
        
        <div style="background: #e5e7eb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280;">
          <p>This is an automated message from Wata Board. Please do not reply to this email.</p>
        </div>
      </div>
    `;

    return { subject, content };
  }
}

export default EmailNotificationService;
