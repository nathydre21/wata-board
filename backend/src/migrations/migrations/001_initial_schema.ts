import { readFileSync } from 'fs';
import { join } from 'path';
import { Migration } from '../Migration';

export const migration001: Migration = {
  id: '001_initial_schema',
  name: 'Initial Database Schema',
  timestamp: new Date('2025-03-25T00:00:00Z'),
  description: 'Creates the initial database schema for Wata Board application',
  
  async up(): Promise<void> {
    const sqlPath = join(__dirname, '../../../database/migrations/001_initial_schema.sql');
    const sql = readFileSync(sqlPath, 'utf8');
    
    // This would be executed by the MigrationRunner with a database connection
    // For now, we'll store the SQL to be executed
    (this as any).sql = sql;
  },
  
  async down(): Promise<void> {
    // Drop tables in reverse order of creation
    const dropTables = `
      DROP VIEW IF EXISTS user_activity;
      DROP VIEW IF EXISTS payment_analytics;
      DROP FUNCTION IF EXISTS get_meter_total_paid(VARCHAR, blockchain_network);
      DROP FUNCTION IF EXISTS invalidate_payment_cache(VARCHAR);
      DROP TRIGGER IF EXISTS invalidate_payment_cache_insert ON payments;
      DROP TRIGGER IF EXISTS invalidate_payment_cache_trigger ON payments;
      DROP FUNCTION IF EXISTS invalidate_cache_on_payment();
      DROP TRIGGER IF EXISTS update_payment_cache_timestamp ON payment_cache;
      DROP FUNCTION IF EXISTS update_payment_cache_timestamp();
      DROP TRIGGER IF EXISTS update_system_config_updated_at ON system_config;
      DROP TRIGGER IF EXISTS update_meters_updated_at ON meters;
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      DROP FUNCTION IF EXISTS update_updated_at_column();
      
      DROP TABLE IF EXISTS rate_limits;
      DROP TABLE IF EXISTS payment_cache;
      DROP TABLE IF EXISTS audit_logs;
      DROP TABLE IF EXISTS system_config;
      DROP TABLE IF EXISTS payments;
      DROP TABLE IF EXISTS meters;
      DROP TABLE IF EXISTS users;
      
      DROP TYPE IF EXISTS payment_status;
      DROP TYPE IF EXISTS meter_type;
      DROP TYPE IF EXISTS blockchain_network;
    `;
    
    (this as any).sql = dropTables;
  }
};
