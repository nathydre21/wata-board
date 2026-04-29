# Audit Logging System

The Wata-Board backend implements a comprehensive audit logging system for financial auditing and regulatory compliance. This system tracks all sensitive operations and payment events with detailed metadata.

## Features

- **Structured Logging**: All audit events follow a consistent schema.
- **Data Redaction**: Sensitive fields like secret keys, tokens, and passwords are automatically redacted.
- **Event Categorization**: 
  - `AUDIT`: Standard business events (e.g., successful payments).
  - `AUDIT_SECURITY`: Security-sensitive events (e.g., KYC rejection, AML flag).
  - `AUDIT_ERROR`: Failures in critical processes.
- **High Retention**: Audit logs are stored in separate files (`logs/audit-%DATE%.log`) with a 1-year retention policy.
- **External Aggregation**: Optional support for shipping logs to external providers (ELK, Loki, etc.) via `LOG_AGGREGATION_URL`.

## Audit Event Schema

Audit events include the following metadata:
- `event_timestamp`: ISO 8601 timestamp.
- `environment`: Current deployment environment.
- `service`: Service name (`wata-board-api`).
- `audit`: Boolean flag for filtering.
- `paymentId`: Unique identifier for the payment request.
- `userId`: User identifier.
- `meterId`: Utility meter identifier.
- `amount`: Transaction amount.
- `status`: Outcome of the event.

## Instrumented Components

### Payment Services
- **KYC Checks**: Status check results and rejections.
- **AML Monitoring**: High-value transaction flags and rejections.
- **Payment Execution**: Transaction hashes and success/failure status.
- **Multi-Provider Flow**: Provider selection and provider-specific rate limits.

### Payment Gateways
- **Stripe Integration**: Intent creation and confirmation results.

### Administrative Operations
- **Contract Upgrades**: Deployment of new WASM binaries and migration status.
- **Rollbacks**: Reversion to previous contract versions.

## Configuration

Set the following environment variables in `backend/.env`:

```bash
# Optional: External log aggregator URL
LOG_AGGREGATION_URL=https://your-log-aggregator.com/api/logs
LOG_AGGREGATION_API_KEY=your-api-key
```

## Log Files

Logs are generated in the `backend/logs/` directory:
- `audit-YYYY-MM-DD.log`: Dedicated audit trail.
- `application-YYYY-MM-DD.log`: General application logs (includes audit).
- `error-YYYY-MM-DD.log`: Error-level logs.
