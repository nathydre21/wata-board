import { Migration } from '../Migration';

export const migration004: Migration = {
  id: '004_multi_provider_support',
  name: 'Multi-Provider Support',
  timestamp: new Date('2025-04-18T00:00:00Z'),
  description: 'Adds support for multiple utility providers',
  dependencies: ['001_initial_schema', '002_add_indexes_and_constraints', '003_blockchain_integration'],
  
  async up(): Promise<void> {
    const sql = `
      -- Create utility_providers table
      CREATE TABLE utility_providers (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          provider_id VARCHAR(50) UNIQUE NOT NULL,
          name VARCHAR(100) NOT NULL,
          logo_url VARCHAR(255),
          contract_id VARCHAR(56) NOT NULL,
          network blockchain_network NOT NULL DEFAULT 'testnet',
          rpc_url VARCHAR(255) NOT NULL,
          is_active BOOLEAN DEFAULT true,
          supported_meter_types meter_type[] NOT NULL DEFAULT ARRAY['electricity', 'water', 'gas'],
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          
          -- Constraints
          CONSTRAINT utility_providers_provider_id_format CHECK (provider_id ~ '^[a-z0-9_-]+$'),
          CONSTRAINT utility_providers_contract_id_format CHECK (contract_id ~ '^[A-Za-z0-9]{56}$'),
          CONSTRAINT utility_providers_name_not_empty CHECK (length(trim(name)) > 0),
          CONSTRAINT utility_providers_rpc_url_not_empty CHECK (length(trim(rpc_url)) > 0)
      );

      -- Add provider_id to meters table
      ALTER TABLE meters ADD COLUMN provider_id VARCHAR(50) NOT NULL DEFAULT 'wata-board';
      ALTER TABLE meters ADD CONSTRAINT meters_provider_id_fkey 
          FOREIGN KEY (provider_id) REFERENCES utility_providers(provider_id) ON DELETE RESTRICT;

      -- Add provider_id to payments table
      ALTER TABLE payments ADD COLUMN provider_id VARCHAR(50) NOT NULL DEFAULT 'wata-board';
      ALTER TABLE payments ADD CONSTRAINT payments_provider_id_fkey 
          FOREIGN KEY (provider_id) REFERENCES utility_providers(provider_id) ON DELETE RESTRICT;

      -- Update payment_cache table to include provider_id
      ALTER TABLE payment_cache ADD COLUMN provider_id VARCHAR(50) NOT NULL DEFAULT 'wata-board';
      ALTER TABLE payment_cache DROP CONSTRAINT IF EXISTS payment_cache_unique_meter_network;
      ALTER TABLE payment_cache ADD CONSTRAINT payment_cache_unique_meter_network_provider 
          UNIQUE (meter_id, blockchain_network, provider_id);

      -- Create indexes for provider-related queries
      CREATE INDEX idx_utility_providers_provider_id ON utility_providers(provider_id);
      CREATE INDEX idx_utility_providers_is_active ON utility_providers(is_active);
      CREATE INDEX idx_utility_providers_network ON utility_providers(network);
      CREATE INDEX idx_meters_provider_id ON meters(provider_id);
      CREATE INDEX idx_payments_provider_id ON payments(provider_id);
      CREATE INDEX idx_payment_cache_provider_id ON payment_cache(provider_id);

      -- Create trigger to update utility_providers.updated_at
      CREATE TRIGGER update_utility_providers_updated_at BEFORE UPDATE ON utility_providers
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      -- Insert default Wata-Board provider
      INSERT INTO utility_providers (provider_id, name, contract_id, network, rpc_url, supported_meter_types, metadata) VALUES
      ('wata-board', 'Wata-Board', 'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA', 'testnet', 'https://soroban-testnet.stellar.org', ARRAY['electricity', 'water', 'gas'], 
       '{"description": "Default utility payment provider", "region": "Global", "is_default": true}');

      -- Update existing meters and payments to use the default provider
      UPDATE meters SET provider_id = 'wata-board' WHERE provider_id IS NULL OR provider_id = '';
      UPDATE payments SET provider_id = 'wata-board' WHERE provider_id IS NULL OR provider_id = '';
      UPDATE payment_cache SET provider_id = 'wata-board' WHERE provider_id IS NULL OR provider_id = '';
    `;
    
    (this as any).sql = sql;
  },
  
  async down(): Promise<void> {
    const sql = `
      -- Remove provider_id columns and constraints
      ALTER TABLE payment_cache DROP CONSTRAINT IF EXISTS payment_cache_unique_meter_network_provider;
      ALTER TABLE payment_cache DROP COLUMN IF EXISTS provider_id;
      
      ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_id_fkey;
      ALTER TABLE payments DROP COLUMN IF EXISTS provider_id;
      
      ALTER TABLE meters DROP CONSTRAINT IF EXISTS meters_provider_id_fkey;
      ALTER TABLE meters DROP COLUMN IF EXISTS provider_id;
      
      DROP TRIGGER IF EXISTS update_utility_providers_updated_at ON utility_providers;
      
      DROP INDEX IF EXISTS idx_payment_cache_provider_id;
      DROP INDEX IF EXISTS idx_payments_provider_id;
      DROP INDEX IF EXISTS idx_meters_provider_id;
      DROP INDEX IF EXISTS idx_utility_providers_network;
      DROP INDEX IF EXISTS idx_utility_providers_is_active;
      DROP INDEX IF EXISTS idx_utility_providers_provider_id;
      
      DROP TABLE IF EXISTS utility_providers;
    `;
    
    (this as any).sql = sql;
  }
};
