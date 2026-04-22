# Standardized Database Schema for Wata-Board

## Overview

This document outlines the updated database schema that aligns with the standardized data formats implemented across the Wata-Board system. The schema ensures consistency between frontend, backend, and database layers.

## Key Standardization Changes

### 1. Field Naming Convention
- **Standard**: `camelCase` (e.g., `meterId`, `userId`)
- **Database**: `snake_case` for SQL compatibility (e.g., `meter_id`, `user_id`)
- **Application**: Automatic conversion between formats

### 2. Amount Storage
- **Standard**: String format to avoid floating-point precision issues
- **Database**: `DECIMAL(20, 8)` for precise decimal storage
- **Smart Contract**: `u32` (integer representation)

### 3. Timestamp Format
- **Standard**: ISO 8601 string format
- **Database**: `TIMESTAMP WITH TIME ZONE`
- **Application**: Automatic conversion utilities

### 4. Status Enums
- **Standard**: Unified enum values across all components
- **Database**: `CHECK` constraints for enum validation
- **Application**: Type-safe enum conversion

## Updated Schema

### 1. Users Table

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) UNIQUE NOT NULL, -- Standardized user identifier
    stellar_public_key VARCHAR(56) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20),
    full_name VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX idx_users_user_id ON users(user_id);
CREATE INDEX idx_users_stellar_public_key ON users(stellar_public_key);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);
```

### 2. Meters Table

```sql
CREATE TABLE meters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_id VARCHAR(50) UNIQUE NOT NULL, -- Standardized meter identifier
    user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    meter_type VARCHAR(20) NOT NULL CHECK (meter_type IN ('electricity', 'water', 'gas')),
    utility_company VARCHAR(100),
    address TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX idx_meters_meter_id ON meters(meter_id);
CREATE INDEX idx_meters_user_id ON meters(user_id);
CREATE INDEX idx_meters_type ON meters(meter_type);
```

### 3. Payments Table

```sql
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_hash VARCHAR(64) UNIQUE NOT NULL,
    meter_id VARCHAR(50) NOT NULL REFERENCES meters(meter_id),
    user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    amount DECIMAL(20, 8) NOT NULL, -- Precise decimal storage
    currency VARCHAR(3) DEFAULT 'XLM' CHECK (currency IN ('XLM')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'scheduled', 'processing', 'completed', 'failed', 'cancelled', 'queued')),
    blockchain_network VARCHAR(20) NOT NULL DEFAULT 'testnet' CHECK (blockchain_network IN ('testnet', 'mainnet')),
    contract_id VARCHAR(56) NOT NULL,
    stellar_transaction_xdr TEXT,
    block_number BIGINT,
    block_timestamp TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX idx_payments_transaction_hash ON payments(transaction_hash);
CREATE INDEX idx_payments_meter_id ON payments(meter_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at);
CREATE INDEX idx_payments_amount ON payments(amount);
CREATE INDEX idx_payments_currency ON payments(currency);
```

### 4. Payment Schedules Table

```sql
CREATE TABLE payment_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id VARCHAR(255) UNIQUE NOT NULL, -- Standardized schedule identifier
    user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    meter_id VARCHAR(50) NOT NULL REFERENCES meters(meter_id),
    amount DECIMAL(20, 8) NOT NULL,
    currency VARCHAR(3) DEFAULT 'XLM' CHECK (currency IN ('XLM')),
    frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('once', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    next_payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'scheduled', 'processing', 'completed', 'failed', 'cancelled', 'queued')),
    description TEXT,
    max_payments INTEGER,
    current_payment_count INTEGER DEFAULT 0,
    notification_email BOOLEAN DEFAULT true,
    notification_push BOOLEAN DEFAULT true,
    notification_sms BOOLEAN DEFAULT false,
    notification_reminder_days INTEGER[] DEFAULT ARRAY[1, 3],
    notification_success BOOLEAN DEFAULT true,
    notification_failure BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX idx_payment_schedules_schedule_id ON payment_schedules(schedule_id);
CREATE INDEX idx_payment_schedules_user_id ON payment_schedules(user_id);
CREATE INDEX idx_payment_schedules_meter_id ON payment_schedules(meter_id);
CREATE INDEX idx_payment_schedules_status ON payment_schedules(status);
CREATE INDEX idx_payment_schedules_next_payment ON payment_schedules(next_payment_date);
```

### 5. Scheduled Payments Table

```sql
CREATE TABLE scheduled_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id VARCHAR(255) UNIQUE NOT NULL, -- Standardized payment identifier
    schedule_id VARCHAR(255) NOT NULL REFERENCES payment_schedules(schedule_id) ON DELETE CASCADE,
    amount DECIMAL(20, 8) NOT NULL,
    currency VARCHAR(3) DEFAULT 'XLM' CHECK (currency IN ('XLM')),
    scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL,
    actual_payment_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'scheduled', 'processing', 'completed', 'failed', 'cancelled', 'queued')),
    transaction_hash VARCHAR(64) REFERENCES payments(transaction_hash),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX idx_scheduled_payments_payment_id ON scheduled_payments(payment_id);
CREATE INDEX idx_scheduled_payments_schedule_id ON scheduled_payments(schedule_id);
CREATE INDEX idx_scheduled_payments_status ON scheduled_payments(status);
CREATE INDEX idx_scheduled_payments_scheduled_date ON scheduled_payments(scheduled_date);
CREATE INDEX idx_scheduled_payments_transaction_hash ON scheduled_payments(transaction_hash);
```

### 6. Payment Cache Table (Updated)

```sql
CREATE TABLE payment_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_id VARCHAR(50) NOT NULL,
    total_paid DECIMAL(20, 8) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'XLM' CHECK (currency IN ('XLM')),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    cache_expiry TIMESTAMP WITH TIME ZONE NOT NULL,
    blockchain_network VARCHAR(20) NOT NULL DEFAULT 'testnet' CHECK (blockchain_network IN ('testnet', 'mainnet'))
);

-- Unique index for cache invalidation
CREATE UNIQUE INDEX idx_payment_cache_meter_network ON payment_cache(meter_id, blockchain_network);
CREATE INDEX idx_payment_cache_expiry ON payment_cache(cache_expiry);
```

### 7. Rate Limits Table (Updated)

```sql
CREATE TABLE rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    window_duration_ms INTEGER NOT NULL DEFAULT 60000,
    max_requests INTEGER NOT NULL DEFAULT 5,
    queue_size INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_rate_limits_user_window ON rate_limits(user_id, window_start);
CREATE INDEX idx_rate_limits_expiry ON rate_limits(window_start + (window_duration_ms || ' milliseconds')::INTERVAL);
```

## Data Conversion Functions

### 1. Amount Conversion

```sql
-- Convert from database DECIMAL to application string
CREATE OR REPLACE FUNCTION amount_to_string(amount DECIMAL) RETURNS TEXT AS $$
BEGIN
    RETURN amount::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Convert from application string to database DECIMAL
CREATE OR REPLACE FUNCTION string_to_amount(amount_str TEXT) RETURNS DECIMAL(20, 8) AS $$
BEGIN
    RETURN amount_str::DECIMAL(20, 8);
END;
$$ LANGUAGE plpgsql;
```

### 2. Timestamp Conversion

```sql
-- Convert from database TIMESTAMP to ISO string
CREATE OR REPLACE FUNCTION timestamp_to_string(ts TIMESTAMP WITH TIME ZONE) RETURNS TEXT AS $$
BEGIN
    RETURN to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
END;
$$ LANGUAGE plpgsql;

-- Convert from ISO string to database TIMESTAMP
CREATE OR REPLACE FUNCTION string_to_timestamp(ts_str TEXT) RETURNS TIMESTAMP WITH TIME ZONE AS $$
BEGIN
    RETURN to_timestamp(ts_str, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AT TIME ZONE 'UTC';
END;
$$ LANGUAGE plpgsql;
```

## Migration Strategy

### Phase 1: Schema Updates
1. Add new standardized columns
2. Create conversion functions
3. Add constraints for data validation

### Phase 2: Data Migration
1. Migrate existing data to new format
2. Validate data integrity
3. Update application logic

### Phase 3: Cleanup
1. Remove deprecated columns
2. Optimize indexes
3. Update documentation

## Validation Rules

### 1. Amount Validation
- Must be positive number
- Maximum precision: 20 digits, 8 decimal places
- Currency must be valid (XLM currently)

### 2. Timestamp Validation
- Must be valid ISO 8601 format
- Must include timezone information
- Future dates for scheduling only

### 3. Status Validation
- Must match predefined enum values
- Status transitions must follow business rules
- Audit trail for status changes

### 4. Identifier Validation
- User IDs: UUID format or standardized string
- Meter IDs: Alphanumeric with specific length
- Transaction hashes: 64-character hexadecimal

## Performance Considerations

### 1. Indexing Strategy
- Primary keys: UUID indexes
- Foreign keys: Indexed for join performance
- Query patterns: Composite indexes for common queries
- Time-based: Partitioning by month for large tables

### 2. Partitioning
```sql
-- Partition payments table by month
CREATE TABLE payments_y2024m01 PARTITION OF payments
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Partition scheduled payments by month
CREATE TABLE scheduled_payments_y2024m01 PARTITION OF scheduled_payments
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

### 3. Caching Strategy
- Redis for session management and rate limiting
- Application cache for frequently accessed data
- Database query result caching

## Security Considerations

### 1. Data Encryption
- Transparent Data Encryption (TDE) at rest
- TLS 1.3 for all connections
- Column-level encryption for sensitive PII

### 2. Access Control
```sql
-- Row Level Security for user data
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_payments ON payments
FOR ALL TO application_user
USING (user_id = current_user_id());

ALTER TABLE payment_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_schedules ON payment_schedules
FOR ALL TO application_user
USING (user_id = current_user_id());
```

### 3. Audit Trail
- Complete audit logging for all data modifications
- Immutable log records
- Regular backup and verification

## Backup and Recovery

### 1. Backup Strategy
- Daily full backups: Complete database backup
- Hourly incremental: Transaction log backups
- Point-in-time recovery: 15-minute RPO
- Cross-region replication: Disaster recovery

### 2. Data Retention
- Payments: 7 years (regulatory requirement)
- Scheduled payments: 7 years
- Audit logs: 3 years
- Rate limits: 30 days
- Cache data: 24 hours

## Monitoring and Maintenance

### 1. Key Metrics
- Database connection pool usage
- Query performance metrics
- Cache hit rates
- Data consistency checks

### 2. Maintenance Tasks
- Daily: Backup verification
- Weekly: Performance tuning
- Monthly: Index maintenance
- Quarterly: Schema review

## Integration Points

### 1. API Endpoints
```sql
-- User management
POST /api/users
GET /api/users/:userId
PUT /api/users/:userId

-- Payment operations
POST /api/payments
GET /api/payments/:paymentId
GET /api/meters/:meterId/payments

-- Schedule operations
POST /api/schedules
GET /api/schedules/:scheduleId
PUT /api/schedules/:scheduleId
DELETE /api/schedules/:scheduleId
```

### 2. Cache Management
```sql
-- Cache operations
GET /api/cache/meters/:meterId/total
POST /api/cache/refresh
DELETE /api/cache/:key
```

This standardized database schema ensures complete consistency across the Wata-Board system while maintaining performance, security, and scalability requirements.
