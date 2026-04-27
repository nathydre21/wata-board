import { Migration } from '../Migration';

export const migration003: Migration = {
  id: '003_blockchain_integration',
  name: 'Blockchain Integration',
  timestamp: new Date('2025-03-25T00:00:00Z'),
  description: 'Adds blockchain-specific tables and integration features',
  dependencies: ['001_initial_schema', '002_add_indexes_and_constraints'],
  
  async up(): Promise<void> {
    const sql = `
      -- Create blockchain_transactions table for detailed tracking
      CREATE TABLE blockchain_transactions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          transaction_hash VARCHAR(64) UNIQUE NOT NULL,
          payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
          stellar_public_key VARCHAR(56) NOT NULL,
          network blockchain_network NOT NULL,
          contract_id VARCHAR(56) NOT NULL,
          transaction_xdr TEXT NOT NULL,
          transaction_envelope_xdr TEXT,
          result_xdr TEXT,
          result_meta_xdr TEXT,
          status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'timeout')),
          block_number BIGINT,
          block_timestamp TIMESTAMP WITH TIME ZONE,
          fee_paid DECIMAL(12, 7) DEFAULT 0,
          operations_count INTEGER DEFAULT 1,
          memo TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          confirmed_at TIMESTAMP WITH TIME ZONE,
          metadata JSONB DEFAULT '{}'::jsonb,
          
          CONSTRAINT blockchain_tx_hash_format CHECK (transaction_hash ~ '^[a-fA-F0-9]{64}$'),
          CONSTRAINT blockchain_public_key_format CHECK (stellar_public_key ~ '^G[A-Z0-9]{55}$')
      );

      -- Create blockchain_sync_status table for tracking synchronization
      CREATE TABLE blockchain_sync_status (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          network blockchain_network NOT NULL UNIQUE,
          contract_id VARCHAR(56) NOT NULL,
          last_synced_block BIGINT DEFAULT 0,
          latest_block BIGINT DEFAULT 0,
          sync_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'completed', 'error')),
          error_message TEXT,
          last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          sync_interval_minutes INTEGER DEFAULT 5,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          metadata JSONB DEFAULT '{}'::jsonb
      );

      -- Create smart_contract_events table for event logging
      CREATE TABLE smart_contract_events (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          transaction_hash VARCHAR(64) NOT NULL,
          event_type VARCHAR(50) NOT NULL,
          contract_id VARCHAR(56) NOT NULL,
          network blockchain_network NOT NULL,
          block_number BIGINT,
          block_timestamp TIMESTAMP WITH TIME ZONE,
          event_data JSONB NOT NULL,
          topics TEXT[],
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          processed BOOLEAN DEFAULT false,
          processed_at TIMESTAMP WITH TIME ZONE,
          
          CONSTRAINT sc_events_tx_hash_format CHECK (transaction_hash ~ '^[a-fA-F0-9]{64}$')
      );

      -- Create blockchain_analytics table for performance metrics
      CREATE TABLE blockchain_analytics (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          network blockchain_network NOT NULL,
          metric_date DATE NOT NULL,
          total_transactions BIGINT DEFAULT 0,
          successful_transactions BIGINT DEFAULT 0,
          failed_transactions BIGINT DEFAULT 0,
          total_fees DECIMAL(12, 7) DEFAULT 0,
          average_fee DECIMAL(12, 7) DEFAULT 0,
          average_confirmation_time_seconds DECIMAL(10, 2) DEFAULT 0,
          total_amount DECIMAL(12, 2) DEFAULT 0,
          unique_users BIGINT DEFAULT 0,
          unique_meters BIGINT DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          
          CONSTRAINT blockchain_analytics_unique UNIQUE (network, metric_date)
      );

      -- Create indexes for blockchain tables
      CREATE INDEX idx_blockchain_transactions_hash ON blockchain_transactions(transaction_hash);
      CREATE INDEX idx_blockchain_transactions_payment_id ON blockchain_transactions(payment_id);
      CREATE INDEX idx_blockchain_transactions_network_status ON blockchain_transactions(network, status);
      CREATE INDEX idx_blockchain_transactions_created_at ON blockchain_transactions(created_at);
      CREATE INDEX idx_blockchain_transactions_confirmed_at ON blockchain_transactions(confirmed_at);
      CREATE INDEX idx_blockchain_transactions_stellar_key ON blockchain_transactions(stellar_public_key);

      CREATE INDEX idx_blockchain_sync_status_network ON blockchain_sync_status(network);
      CREATE INDEX idx_blockchain_sync_status_status ON blockchain_sync_status(sync_status);
      CREATE INDEX idx_blockchain_sync_status_last_sync ON blockchain_sync_status(last_sync_at);

      CREATE INDEX idx_smart_contract_events_tx_hash ON smart_contract_events(transaction_hash);
      CREATE INDEX idx_smart_contract_events_contract_network ON smart_contract_events(contract_id, network);
      CREATE INDEX idx_smart_contract_events_type ON smart_contract_events(event_type);
      CREATE INDEX idx_smart_contract_events_processed ON smart_contract_events(processed);
      CREATE INDEX idx_smart_contract_events_created_at ON smart_contract_events(created_at);

      CREATE INDEX idx_blockchain_analytics_network_date ON blockchain_analytics(network, metric_date);
      CREATE INDEX idx_blockchain_analytics_date ON blockchain_analytics(metric_date);

      -- Create triggers
      CREATE TRIGGER update_blockchain_transactions_updated_at 
          BEFORE UPDATE ON blockchain_transactions 
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_blockchain_sync_status_updated_at 
          BEFORE UPDATE ON blockchain_sync_status 
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_blockchain_analytics_updated_at 
          BEFORE UPDATE ON blockchain_analytics 
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `;
    
    (this as any).sql = sql;
  },
  
  async down(): Promise<void> {
    const sql = `
      DROP TRIGGER IF EXISTS update_blockchain_analytics_updated_at ON blockchain_analytics;
      DROP TRIGGER IF EXISTS update_blockchain_sync_status_updated_at ON blockchain_sync_status;
      DROP TRIGGER IF EXISTS update_blockchain_transactions_updated_at ON blockchain_transactions;
      
      DROP INDEX IF EXISTS idx_blockchain_analytics_date;
      DROP INDEX IF EXISTS idx_blockchain_analytics_network_date;
      DROP INDEX IF EXISTS idx_smart_contract_events_created_at;
      DROP INDEX IF EXISTS idx_smart_contract_events_processed;
      DROP INDEX IF EXISTS idx_smart_contract_events_type;
      DROP INDEX IF EXISTS idx_smart_contract_events_contract_network;
      DROP INDEX IF EXISTS idx_smart_contract_events_tx_hash;
      DROP INDEX IF EXISTS idx_blockchain_sync_status_last_sync;
      DROP INDEX IF EXISTS idx_blockchain_sync_status_status;
      DROP INDEX IF EXISTS idx_blockchain_sync_status_network;
      DROP INDEX IF EXISTS idx_blockchain_transactions_stellar_key;
      DROP INDEX IF EXISTS idx_blockchain_transactions_confirmed_at;
      DROP INDEX IF EXISTS idx_blockchain_transactions_created_at;
      DROP INDEX IF EXISTS idx_blockchain_transactions_network_status;
      DROP INDEX IF EXISTS idx_blockchain_transactions_payment_id;
      DROP INDEX IF EXISTS idx_blockchain_transactions_hash;
      
      DROP TABLE IF EXISTS blockchain_analytics;
      DROP TABLE IF EXISTS smart_contract_events;
      DROP TABLE IF EXISTS blockchain_sync_status;
      DROP TABLE IF EXISTS blockchain_transactions;
    `;
    
    (this as any).sql = sql;
  }
};
