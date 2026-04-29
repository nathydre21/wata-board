# Email Notification System for Scheduled Payments

This document describes the email notification system implemented for scheduled payment execution in the Wata Board application.

## Overview

The email notification system provides automated email notifications to users when:
- Scheduled payments are executed successfully
- Scheduled payments fail
- Payment reminders are sent before due dates
- Payment schedules are created, cancelled, or modified

## Architecture

### Core Components

1. **EmailNotificationService** (`src/services/emailNotificationService.ts`)
   - Handles email sending via Nodemailer
   - Manages email records in database
   - Provides retry mechanism for failed emails
   - Supports user preferences for email notifications

2. **ScheduledPaymentService** (`src/services/scheduledPaymentService.ts`)
   - Processes scheduled payments on backend
   - Triggers email notifications for payment events
   - Handles payment retries and rescheduling

3. **Database Schema** (`database/migrations/003_add_scheduled_payments.sql`)
   - `payment_schedules` - Stores payment schedule configurations
   - `scheduled_payments` - Individual payment instances
   - `notification_settings` - User notification preferences
   - `email_notifications` - Email delivery tracking

### Email Templates

The system includes responsive HTML email templates for:
- **Payment Success**: Green header, payment details, transaction info
- **Payment Failure**: Red header, error details, retry information
- **Payment Reminder**: Orange header, upcoming payment details
- **Schedule Created**: Green header, schedule confirmation
- **Schedule Cancelled**: Orange header, cancellation confirmation

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Enable email notifications
EMAIL_NOTIFICATION_ENABLED=true

# SMTP Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM_ADDRESS=noreply@wata-board.com
EMAIL_FROM_NAME=Wata Board
```

### Email Service Providers

The system works with any SMTP provider. Examples:

**Gmail:**
```bash
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
```

**Outlook:**
```bash
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_SECURE=false
```

**SendGrid:**
```bash
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_SECURE=false
```

## API Endpoints

### Scheduled Payments Management

- `POST /api/scheduled-payments` - Create payment schedule
- `GET /api/scheduled-payments/:userId` - Get user schedules
- `GET /api/scheduled-payments/:userId/:scheduleId` - Get specific schedule
- `DELETE /api/scheduled-payments/:userId/:scheduleId` - Cancel schedule

### Email Notifications

- `GET /api/scheduled-payments/:userId/notifications/history` - Get email history
- `POST /api/scheduled-payments/:userId/notifications/test` - Send test email

## Features

### User Preferences

Users can control:
- Email notifications on/off
- Success/failure notifications
- Reminder notifications
- Reminder days (1, 3, 7 days before payment)

### Retry Mechanism

- Automatic retry for failed emails (3 attempts max)
- 5-minute delay between retries
- Detailed error logging
- Status tracking in database

### Payment Processing Flow

1. **Schedule Creation**: User creates payment schedule via API
2. **Background Processing**: Service checks for due payments every minute
3. **Payment Execution**: Processes payment through existing PaymentService
4. **Email Notification**: Sends appropriate email based on result
5. **Rescheduling**: Updates next payment date or completes schedule

## Database Schema

### Payment Schedules Table
```sql
CREATE TABLE payment_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    meter_id VARCHAR(50) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    frequency payment_frequency NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    next_payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status scheduled_payment_status NOT NULL DEFAULT 'scheduled',
    description TEXT,
    max_payments INTEGER,
    current_payment_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Email Notifications Table
```sql
CREATE TABLE email_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    scheduled_payment_id UUID REFERENCES scheduled_payments(id),
    payment_schedule_id UUID REFERENCES payment_schedules(id),
    type VARCHAR(50) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## Security Considerations

1. **Email Credentials**: Store in environment variables, never in code
2. **User Privacy**: Only send to users who have opted in
3. **Rate Limiting**: Respect email provider rate limits
4. **Error Handling**: Never expose sensitive information in error messages

## Testing

Run the email notification tests:

```bash
npm test -- emailNotificationService.test.ts
```

Test cases cover:
- Email sending success/failure
- User preference handling
- Retry mechanism
- Template generation
- Database operations

## Monitoring

### Logs

Email operations are logged with:
- Email ID and type
- User ID and recipient
- Success/failure status
- Error details (if applicable)
- Processing time

### Metrics

Track:
- Email delivery rate
- Failure rate by type
- Retry success rate
- User engagement with emails

## Troubleshooting

### Common Issues

1. **Email Not Sending**
   - Check `EMAIL_NOTIFICATION_ENABLED=true`
   - Verify SMTP credentials
   - Check network connectivity

2. **High Failure Rate**
   - Review SMTP provider limits
   - Check email content for spam triggers
   - Verify recipient email addresses

3. **Missing Templates**
   - Ensure email service is properly initialized
   - Check template file paths

### Debug Mode

Set `LOG_LEVEL=debug` for detailed email operation logs.

## Future Enhancements

1. **Email Templates Editor**: Allow users to customize email templates
2. **Batch Processing**: Improve performance for bulk notifications
3. **Analytics Dashboard**: Track email engagement metrics
4. **Multi-language Support**: Localized email templates
5. **Attachment Support**: Include payment receipts as PDFs

## Dependencies

- `nodemailer`: Email sending library
- `@types/nodemailer`: TypeScript definitions
- PostgreSQL: Database for email tracking
- Existing PaymentService: Payment processing

## Integration Notes

The email system integrates with:
- **PaymentService**: For payment execution and webhook notifications
- **ScheduledPaymentService**: For backend scheduled payment processing
- **User Management**: For email preferences and user data
- **Logging System**: For operation tracking and debugging
