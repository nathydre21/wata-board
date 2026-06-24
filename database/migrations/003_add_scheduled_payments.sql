-- Wata Board Database Migration - Scheduled Payments
-- Version: 003
-- Description: Adds tables for scheduled payments and email notifications
-- Created: 2025-04-28

-- Create custom types for scheduled payments
CREATE TYPE payment_frequency AS ENUM ('once', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly');
CREATE TYPE scheduled_payment_status AS ENUM ('pending', 'scheduled', 'processing', 'completed', 'failed', 'cancelled', 'paused');
CREATE TYPE notification_type AS ENUM ('email', 'push', 'sms');

-- Create payment_schedules table
CREATE TABLE payment_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    meter_id VARCHAR(50) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    frequency payment_frequency NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    next_payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status scheduled_payment_status NOT NULL DEFAULT 'scheduled',
    description TEXT,
    max_payments INTEGER CHECK (max_payments > 0),
    current_payment_count INTEGER NOT NULL DEFAULT 0 CHECK (current_payment_count >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Foreign key constraint to meters table
    CONSTRAINT payment_schedules_meter_id_fkey FOREIGN KEY (meter_id) REFERENCES meters(meter_id) ON DELETE CASCADE,
    
    -- Constraints
    CONSTRAINT payment_schedules_dates_valid CHECK (end_date IS NULL OR end_date > start_date),
    CONSTRAINT payment_schedules_next_payment_valid CHECK (next_payment_date >= start_date),
    CONSTRAINT payment_schedules_payment_count_valid CHECK (max_payments IS NULL OR current_payment_count <= max_payments)
);

-- Create scheduled_payments table (individual payment instances)
CREATE TABLE scheduled_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id UUID NOT NULL REFERENCES payment_schedules(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL,
    actual_payment_date TIMESTAMP WITH TIME ZONE,
    status scheduled_payment_status NOT NULL DEFAULT 'pending',
    transaction_hash VARCHAR(64),
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT scheduled_payments_transaction_hash_format CHECK (transaction_hash IS NULL OR transaction_hash ~ '^[a-fA-F0-9]{64}$'),
    CONSTRAINT scheduled_payments_date_valid CHECK (actual_payment_date IS NULL OR actual_payment_date >= scheduled_date)
);

-- Create notification_settings table
CREATE TABLE notification_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_enabled BOOLEAN NOT NULL DEFAULT true,
    push_enabled BOOLEAN NOT NULL DEFAULT true,
    sms_enabled BOOLEAN NOT NULL DEFAULT false,
    reminder_days INTEGER[] DEFAULT ARRAY[1, 3, 7], -- Days before payment to send reminders
    success_notification BOOLEAN NOT NULL DEFAULT true,
    failure_notification BOOLEAN NOT NULL DEFAULT true,
    reminder_notification BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint
    CONSTRAINT notification_settings_user_unique UNIQUE (user_id)
);

-- Create email_notifications table (for tracking sent emails)
CREATE TABLE email_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheduled_payment_id UUID REFERENCES scheduled_payments(id) ON DELETE SET NULL,
    payment_schedule_id UUID REFERENCES payment_schedules(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL, -- 'payment_success', 'payment_failed', 'payment_reminder', 'schedule_created', etc.
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT email_notifications_type_valid CHECK (type IN ('payment_success', 'payment_failed', 'payment_reminder', 'schedule_created', 'schedule_cancelled', 'schedule_paused', 'schedule_resumed')),
    CONSTRAINT email_notifications_status_valid CHECK (status IN ('pending', 'sent', 'failed')),
    CONSTRAINT email_notifications_email_format CHECK (recipient_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Create indexes for performance
-- Payment schedules indexes
CREATE INDEX idx_payment_schedules_user_id ON payment_schedules(user_id);
CREATE INDEX idx_payment_schedules_meter_id ON payment_schedules(meter_id);
CREATE INDEX idx_payment_schedules_status ON payment_schedules(status);
CREATE INDEX idx_payment_schedules_next_payment_date ON payment_schedules(next_payment_date);
CREATE INDEX idx_payment_schedules_frequency ON payment_schedules(frequency);
CREATE INDEX idx_payment_schedules_created_at ON payment_schedules(created_at);

-- Scheduled payments indexes
CREATE INDEX idx_scheduled_payments_schedule_id ON scheduled_payments(schedule_id);
CREATE INDEX idx_scheduled_payments_status ON scheduled_payments(status);
CREATE INDEX idx_scheduled_payments_scheduled_date ON scheduled_payments(scheduled_date);
CREATE INDEX idx_scheduled_payments_transaction_hash ON scheduled_payments(transaction_hash);
CREATE INDEX idx_scheduled_payments_created_at ON scheduled_payments(created_at);

-- Notification settings indexes
CREATE INDEX idx_notification_settings_user_id ON notification_settings(user_id);

-- Email notifications indexes
CREATE INDEX idx_email_notifications_user_id ON email_notifications(user_id);
CREATE INDEX idx_email_notifications_scheduled_payment_id ON email_notifications(scheduled_payment_id);
CREATE INDEX idx_email_notifications_payment_schedule_id ON email_notifications(payment_schedule_id);
CREATE INDEX idx_email_notifications_type ON email_notifications(type);
CREATE INDEX idx_email_notifications_status ON email_notifications(status);
CREATE INDEX idx_email_notifications_created_at ON email_notifications(created_at);

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_payment_schedules_updated_at BEFORE UPDATE ON payment_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scheduled_payments_updated_at BEFORE UPDATE ON scheduled_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_settings_updated_at BEFORE UPDATE ON notification_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to calculate next payment date
CREATE OR REPLACE FUNCTION calculate_next_payment_date(
    p_current_date TIMESTAMP WITH TIME ZONE,
    p_frequency payment_frequency
)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
BEGIN
    CASE p_frequency
        WHEN 'once' THEN RETURN p_current_date;
        WHEN 'daily' THEN RETURN p_current_date + INTERVAL '1 day';
        WHEN 'weekly' THEN RETURN p_current_date + INTERVAL '1 week';
        WHEN 'biweekly' THEN RETURN p_current_date + INTERVAL '2 weeks';
        WHEN 'monthly' THEN RETURN p_current_date + INTERVAL '1 month';
        WHEN 'quarterly' THEN RETURN p_current_date + INTERVAL '3 months';
        WHEN 'yearly' THEN RETURN p_current_date + INTERVAL '1 year';
        ELSE RETURN p_current_date;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Create function to update next payment date for a schedule
CREATE OR REPLACE FUNCTION update_schedule_next_payment_date(
    p_schedule_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_schedule payment_schedules%ROWTYPE;
    v_next_date TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get current schedule
    SELECT * INTO v_schedule FROM payment_schedules WHERE id = p_schedule_id;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Calculate next payment date
    v_next_date := calculate_next_payment_date(v_schedule.next_payment_date, v_schedule.frequency);
    
    -- Check if next payment exceeds end date or max payments
    IF (v_schedule.end_date IS NOT NULL AND v_next_date > v_schedule.end_date) THEN
        -- Schedule is complete
        UPDATE payment_schedules 
        SET status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE id = p_schedule_id;
    ELSIF (v_schedule.max_payments IS NOT NULL AND v_schedule.current_payment_count >= v_schedule.max_payments) THEN
        -- Schedule is complete
        UPDATE payment_schedules 
        SET status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE id = p_schedule_id;
    ELSE
        -- Update next payment date
        UPDATE payment_schedules 
        SET next_payment_date = v_next_date, updated_at = CURRENT_TIMESTAMP
        WHERE id = p_schedule_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically create notification settings for new users
CREATE OR REPLACE FUNCTION create_default_notification_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO notification_settings (user_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_notification_settings_trigger
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION create_default_notification_settings();

-- Insert default system configuration for scheduled payments
INSERT INTO system_config (key, value, description) VALUES
('scheduled_payment_enabled', 'true', 'Enable scheduled payment processing'),
('scheduled_payment_batch_size', '50', 'Number of scheduled payments to process in one batch'),
('scheduled_payment_retry_limit', '3', 'Maximum retry attempts for failed scheduled payments'),
('scheduled_payment_retry_delay_minutes', '5', 'Delay between retry attempts in minutes'),
('email_notification_enabled', 'true', 'Enable email notifications for scheduled payments'),
('email_reminder_days', '[1, 3, 7]', 'Default days before payment to send reminder emails'),
('email_from_address', '"noreply@wata-board.com"', 'From address for email notifications'),
('email_from_name', '"Wata Board"', 'From name for email notifications');

-- Migration completed successfully
-- Record migration
INSERT INTO system_config (key, value, description) VALUES
('migration_003_scheduled_payments', '"completed"', 'Scheduled payments migration completed at ' || CURRENT_TIMESTAMP);

COMMIT;
