import { Migration } from '../Migration';

export const migration002: Migration = {
  id: '002_add_indexes_and_constraints',
  name: 'Enhanced Indexes and Constraints',
  timestamp: new Date('2025-03-25T00:00:00Z'),
  description: 'Adds additional indexes, constraints, and optimizations',
  dependencies: ['001_initial_schema'],
  
  async up(): Promise<void> {
    const sql = `
      -- Add composite indexes for common query patterns
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_user_status_created 
      ON payments(user_id, status, created_at DESC);

      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_meter_status_created 
      ON payments(meter_id, status, created_at DESC);

      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_network_status_created 
      ON payments(blockchain_network, status, created_at DESC);

      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meters_user_active_type 
      ON meters(user_id, is_active, meter_type);

      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_action_created 
      ON audit_logs(user_id, action, created_at DESC);

      -- Add partial indexes for better performance
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_pending 
      ON payments(created_at) WHERE status = 'pending';

      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_confirmed 
      ON payments(confirmed_at) WHERE status = 'confirmed' AND confirmed_at IS NOT NULL;

      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_active 
      ON users(created_at) WHERE is_active = true;

      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meters_active 
      ON meters(created_at) WHERE is_active = true;

      -- Add GIN indexes for JSONB columns
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_metadata_gin 
      ON users USING GIN(metadata);

      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_metadata_gin 
      ON payments USING GIN(metadata);

      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meters_metadata_gin 
      ON meters USING GIN(metadata);

      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_old_values_gin 
      ON audit_logs USING GIN(old_values);

      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_new_values_gin 
      ON audit_logs USING GIN(new_values);

      -- Add check constraints for data integrity
      ALTER TABLE payments 
      ADD CONSTRAINT IF NOT EXISTS payments_amount_range 
      CHECK (amount BETWEEN 0.01 AND 999999.99);

      ALTER TABLE payments 
      ADD CONSTRAINT IF NOT EXISTS payments_currency_format 
      CHECK (currency ~ '^[A-Z]{3}$');

      ALTER TABLE rate_limits 
      ADD CONSTRAINT IF NOT EXISTS rate_limits_request_count_valid 
      CHECK (request_count <= max_requests);

      ALTER TABLE users 
      ADD CONSTRAINT IF NOT EXISTS users_phone_format 
      CHECK (phone IS NULL OR phone ~ '^\\+?[1-9]\\d{1,14}$');

      -- Add unique constraints for business logic
      ALTER TABLE meters 
      ADD CONSTRAINT IF NOT EXISTS meters_unique_user_meter 
      UNIQUE (user_id, meter_id);

      -- Create materialized view for payment statistics
      CREATE MATERIALIZED VIEW IF NOT EXISTS payment_statistics AS
      SELECT 
          DATE_TRUNC('day', created_at) as payment_date,
          blockchain_network,
          COUNT(*) as total_transactions,
          COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_transactions,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_transactions,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_transactions,
          SUM(amount) FILTER (WHERE status = 'confirmed') as total_amount,
          AVG(amount) FILTER (WHERE status = 'confirmed') as average_amount,
          MIN(amount) FILTER (WHERE status = 'confirmed') as min_amount,
          MAX(amount) FILTER (WHERE status = 'confirmed') as max_amount
      FROM payments
      GROUP BY DATE_TRUNC('day', created_at), blockchain_network
      ORDER BY payment_date DESC;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_statistics_unique 
      ON payment_statistics(payment_date, blockchain_network);
    `;
    
    (this as any).sql = sql;
  },
  
  async down(): Promise<void> {
    const sql = `
      DROP MATERIALIZED VIEW IF EXISTS payment_statistics;
      
      ALTER TABLE meters DROP CONSTRAINT IF EXISTS meters_unique_user_meter;
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_format;
      ALTER TABLE rate_limits DROP CONSTRAINT IF EXISTS rate_limits_request_count_valid;
      ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_currency_format;
      ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_range;
      
      DROP INDEX IF EXISTS idx_audit_logs_new_values_gin;
      DROP INDEX IF EXISTS idx_audit_logs_old_values_gin;
      DROP INDEX IF EXISTS idx_meters_metadata_gin;
      DROP INDEX IF EXISTS idx_payments_metadata_gin;
      DROP INDEX IF EXISTS idx_users_metadata_gin;
      DROP INDEX IF EXISTS idx_meters_active;
      DROP INDEX IF EXISTS idx_users_active;
      DROP INDEX IF EXISTS idx_payments_confirmed;
      DROP INDEX IF EXISTS idx_payments_pending;
      DROP INDEX IF EXISTS idx_audit_logs_user_action_created;
      DROP INDEX IF EXISTS idx_meters_user_active_type;
      DROP INDEX IF EXISTS idx_payments_network_status_created;
      DROP INDEX IF EXISTS idx_payments_meter_status_created;
      DROP INDEX IF EXISTS idx_payments_user_status_created;
    `;
    
    (this as any).sql = sql;
  }
};
