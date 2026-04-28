import { Migration } from '../Migration';

/**
 * Migration 005 — Contract Proxy Schema
 *
 * Adds tables required for the proxy-pattern upgrade mechanism:
 *   • contract_versions   – persisted registry of all deployed contract versions
 *   • contract_payment_routing – maps payments to the contract version that processed them
 *   • contract_data_snapshots  – pre-upgrade payment state snapshots for data preservation
 */
export const migration005: Migration = {
  id: '005_contract_proxy_schema',
  name: 'Contract Proxy Schema',
  timestamp: new Date('2026-04-28T00:00:00Z'),
  description: 'Adds contract version registry, payment routing map, and data snapshot tables for proxy-pattern upgrades',
  dependencies: ['003_blockchain_integration', '004_multi_provider_support'],

  async up(): Promise<void> {
    const sql = `
      -- Enum for contract version lifecycle
      DO $$ BEGIN
        CREATE TYPE contract_version_status AS ENUM ('pending', 'active', 'archived', 'rolled_back');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      -- Persisted contract version registry
      CREATE TABLE IF NOT EXISTS contract_versions (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        version       VARCHAR(20)  NOT NULL,
        wasm_hash     VARCHAR(128) NOT NULL,
        contract_id   VARCHAR(56)  NOT NULL,
        network       blockchain_network NOT NULL,
        status        contract_version_status NOT NULL DEFAULT 'pending',
        deployed_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        deployed_by   VARCHAR(100) NOT NULL,
        description   TEXT,
        metadata      JSONB DEFAULT '{}'::jsonb,
        CONSTRAINT contract_versions_version_unique UNIQUE (version, network)
      );

      CREATE INDEX IF NOT EXISTS idx_contract_versions_status  ON contract_versions(status);
      CREATE INDEX IF NOT EXISTS idx_contract_versions_network ON contract_versions(network);

      -- Maps each payment to the contract version that processed it
      CREATE TABLE IF NOT EXISTS contract_payment_routing (
        payment_id          UUID        NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
        contract_version_id UUID        NOT NULL REFERENCES contract_versions(id),
        contract_id         VARCHAR(56) NOT NULL,
        routed_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (payment_id)
      );

      CREATE INDEX IF NOT EXISTS idx_cpr_contract_version ON contract_payment_routing(contract_version_id);

      -- Pre-upgrade snapshots for data preservation
      CREATE TABLE IF NOT EXISTS contract_data_snapshots (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        from_version    VARCHAR(20) NOT NULL,
        to_version      VARCHAR(20) NOT NULL,
        network         blockchain_network NOT NULL,
        snapshot_data   JSONB NOT NULL DEFAULT '{}'::jsonb,
        payment_count   INTEGER NOT NULL DEFAULT 0,
        total_volume    DECIMAL(18, 7) NOT NULL DEFAULT 0,
        status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'completed', 'failed', 'restored')),
        created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at    TIMESTAMP WITH TIME ZONE,
        error_message   TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_snapshots_from_version ON contract_data_snapshots(from_version);
      CREATE INDEX IF NOT EXISTS idx_snapshots_status       ON contract_data_snapshots(status);
    `;
    (this as any).sql = sql;
  },

  async down(): Promise<void> {
    const sql = `
      DROP TABLE IF EXISTS contract_payment_routing;
      DROP TABLE IF EXISTS contract_data_snapshots;
      DROP TABLE IF EXISTS contract_versions;
      DROP TYPE  IF EXISTS contract_version_status;
    `;
    (this as any).sql = sql;
  },
};
