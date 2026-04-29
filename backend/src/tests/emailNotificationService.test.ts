import { EmailNotificationService } from '../services/emailNotificationService';
import { Pool } from 'pg';

// Mock database for testing
const mockDb = {
  query: jest.fn(),
} as unknown as Pool;

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransporter: jest.fn().mockReturnValue({
    verify: jest.fn((callback) => callback(null, true)),
    sendMail: jest.fn().mockResolvedValue({
      messageId: 'test-message-id',
    }),
  }),
}));

describe('EmailNotificationService', () => {
  let emailService: EmailNotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    emailService = new EmailNotificationService(mockDb);
  });

  describe('sendEmail', () => {
    it('should send email successfully when enabled', async () => {
      const payload = {
        userId: 'test-user-id',
        type: 'payment_success' as const,
        recipientEmail: 'test@example.com',
        subject: 'Test Subject',
        content: '<p>Test Content</p>',
      };

      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          id: 'email-id',
          user_id: payload.userId,
          type: payload.type,
          recipient_email: payload.recipientEmail,
          subject: payload.subject,
          content: payload.content,
          status: 'sent',
          created_at: new Date(),
          metadata: {},
        }],
      });

      const result = await emailService.sendEmail(payload);

      expect(result).toBeDefined();
      expect(result.id).toBe('email-id');
      expect(result.status).toBe('sent');
      expect(result.recipientEmail).toBe(payload.recipientEmail);
    });

    it('should handle email sending failure', async () => {
      const payload = {
        userId: 'test-user-id',
        type: 'payment_failed' as const,
        recipientEmail: 'test@example.com',
        subject: 'Test Subject',
        content: '<p>Test Content</p>',
      };

      // Mock database to return record
      mockDb.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'email-id',
            user_id: payload.userId,
            type: payload.type,
            recipient_email: payload.recipientEmail,
            subject: payload.subject,
            content: payload.content,
            status: 'pending',
            created_at: new Date(),
            metadata: {},
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'email-id',
            status: 'failed',
            error_message: 'SMTP connection failed',
            updated_at: new Date(),
          }],
        });

      // Mock nodemailer to throw error
      const nodemailer = require('nodemailer');
      nodemailer.createTransporter = jest.fn().mockReturnValue({
        verify: jest.fn((callback) => callback(null, true)),
        sendMail: jest.fn().mockRejectedValue(new Error('SMTP connection failed')),
      });

      const result = await emailService.sendEmail(payload);

      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBe('SMTP connection failed');
    });
  });

  describe('sendPaymentSuccessNotification', () => {
    it('should send success notification when email is enabled', async () => {
      const userId = 'test-user-id';
      const scheduledPaymentId = 'payment-123';
      const paymentScheduleId = 'schedule-456';
      const amount = 100.50;
      const meterId = 'METER-001';
      const transactionHash = 'tx-abc123';

      mockDb.query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ email_enabled: true }] })
        .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
        .mockResolvedValue({
          rows: [{
            id: 'email-id',
            user_id: userId,
            scheduled_payment_id: scheduledPaymentId,
            payment_schedule_id: paymentScheduleId,
            type: 'payment_success',
            recipient_email: 'user@example.com',
            subject: expect.stringContaining('Payment Successful'),
            content: expect.stringContaining('Payment Successful'),
            status: 'sent',
            created_at: new Date(),
            metadata: { amount, meterId, transactionHash },
          }],
        });

      const result = await emailService.sendPaymentSuccessNotification(
        userId, scheduledPaymentId, paymentScheduleId, amount, meterId, transactionHash
      );

      expect(result).toBeDefined();
      expect(result?.type).toBe('payment_success');
      expect(result?.recipientEmail).toBe('user@example.com');
    });

    it('should not send email when disabled for user', async () => {
      const userId = 'test-user-id';

      mockDb.query = jest.fn().mockResolvedValue({ rows: [{ email_enabled: false }] });

      const result = await emailService.sendPaymentSuccessNotification(
        userId, 'payment-123', 'schedule-456', 100, 'METER-001'
      );

      expect(result).toBeNull();
    });
  });

  describe('sendPaymentFailureNotification', () => {
    it('should send failure notification when email is enabled', async () => {
      const userId = 'test-user-id';
      const scheduledPaymentId = 'payment-123';
      const paymentScheduleId = 'schedule-456';
      const amount = 100.50;
      const meterId = 'METER-001';
      const errorMessage = 'Insufficient funds';

      mockDb.query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ email_enabled: true }] })
        .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
        .mockResolvedValue({
          rows: [{
            id: 'email-id',
            user_id: userId,
            scheduled_payment_id: scheduledPaymentId,
            payment_schedule_id: paymentScheduleId,
            type: 'payment_failed',
            recipient_email: 'user@example.com',
            subject: expect.stringContaining('Payment Failed'),
            content: expect.stringContaining('Payment Failed'),
            status: 'sent',
            created_at: new Date(),
            metadata: { amount, meterId, errorMessage },
          }],
        });

      const result = await emailService.sendPaymentFailureNotification(
        userId, scheduledPaymentId, paymentScheduleId, amount, meterId, errorMessage
      );

      expect(result).toBeDefined();
      expect(result?.type).toBe('payment_failed');
      expect(result?.recipientEmail).toBe('user@example.com');
    });
  });

  describe('sendPaymentReminderNotification', () => {
    it('should send reminder notification when email is enabled', async () => {
      const userId = 'test-user-id';
      const paymentScheduleId = 'schedule-456';
      const amount = 100.50;
      const meterId = 'METER-001';
      const scheduledDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow

      mockDb.query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ email_enabled: true }] })
        .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
        .mockResolvedValue({
          rows: [{
            id: 'email-id',
            user_id: userId,
            payment_schedule_id: paymentScheduleId,
            type: 'payment_reminder',
            recipient_email: 'user@example.com',
            subject: expect.stringContaining('Payment Reminder'),
            content: expect.stringContaining('Payment Reminder'),
            status: 'sent',
            created_at: new Date(),
            metadata: { amount, meterId, scheduledDate },
          }],
        });

      const result = await emailService.sendPaymentReminderNotification(
        userId, paymentScheduleId, amount, meterId, scheduledDate
      );

      expect(result).toBeDefined();
      expect(result?.type).toBe('payment_reminder');
      expect(result?.recipientEmail).toBe('user@example.com');
    });
  });

  describe('getEmailHistory', () => {
    it('should return email history for user', async () => {
      const userId = 'test-user-id';
      const mockEmails = [
        {
          id: 'email-1',
          user_id: userId,
          type: 'payment_success',
          recipient_email: 'user@example.com',
          subject: 'Payment Successful',
          content: '<p>Payment was successful</p>',
          status: 'sent',
          created_at: new Date(),
          metadata: {},
        },
        {
          id: 'email-2',
          user_id: userId,
          type: 'payment_reminder',
          recipient_email: 'user@example.com',
          subject: 'Payment Reminder',
          content: '<p>Payment reminder</p>',
          status: 'sent',
          created_at: new Date(),
          metadata: {},
        },
      ];

      mockDb.query = jest.fn().mockResolvedValue({ rows: mockEmails });

      const result = await emailService.getEmailHistory(userId);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('payment_success');
      expect(result[1].type).toBe('payment_reminder');
    });
  });

  describe('retryFailedEmails', () => {
    it('should retry failed emails and update status', async () => {
      const failedEmails = [
        {
          id: 'email-1',
          user_id: 'user-1',
          type: 'payment_success',
          recipient_email: 'user1@example.com',
          subject: 'Payment Successful',
          content: '<p>Payment was successful</p>',
          status: 'pending',
          created_at: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
          metadata: {},
        },
      ];

      mockDb.query = jest.fn()
        .mockResolvedValueOnce({ rows: failedEmails }) // getPendingEmails
        .mockResolvedValue({ rows: [{ status: 'sent', updated_at: new Date() }] }); // updateEmailRecord

      const nodemailer = require('nodemailer');
      nodemailer.createTransporter = jest.fn().mockReturnValue({
        verify: jest.fn((callback) => callback(null, true)),
        sendMail: jest.fn().mockResolvedValue({ messageId: 'retry-message-id' }),
      });

      const retriedCount = await emailService.retryFailedEmails();

      expect(retriedCount).toBe(1);
      expect(mockDb.query).toHaveBeenCalledTimes(3); // getPending + update + getPending (for count)
    });
  });
});
