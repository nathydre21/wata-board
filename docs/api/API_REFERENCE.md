# Wata Board API Reference

## Overview

Wata Board provides a comprehensive REST API for blockchain-based payment processing, wallet management, and financial transactions. This document provides complete API endpoint documentation, authentication details, and usage examples.

## Base URL

```
Production: https://api.wata-board.com
Development: http://localhost:3000
```

## Authentication

All API requests require authentication using JWT tokens (JSON Web Tokens).

### Obtaining a Token

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password"
}
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "user": {
    "id": "user_123",
    "email": "user@example.com"
  }
}
```

### Using the Token

Include the token in the Authorization header:
```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## API Endpoints

### Authentication

#### Sign Up
```http
POST /api/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password",
  "passwordConfirm": "secure_password",
  "username": "username"
}
```

**Responses:**
- `201 Created` - User created successfully
- `400 Bad Request` - Invalid input
- `409 Conflict` - Email already exists

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Responses:**
- `200 OK` - Login successful, returns token
- `401 Unauthorized` - Invalid credentials
- `429 Too Many Requests` - Rate limited

#### Refresh Token
```http
POST /api/auth/refresh
Authorization: Bearer {token}
```

**Responses:**
- `200 OK` - New token issued
- `401 Unauthorized` - Invalid or expired token

#### Logout
```http
POST /api/auth/logout
Authorization: Bearer {token}
```

**Responses:**
- `200 OK` - Logout successful
- `401 Unauthorized` - Invalid token

### Wallet Management

#### Get Wallet Balance
```http
GET /api/wallet/balance
Authorization: Bearer {token}
```

**Response:**
```json
{
  "address": "0x1234567890abcdef",
  "balance": "1000000000000000000",
  "currency": "WEI",
  "lastUpdated": "2024-03-29T10:30:00Z"
}
```

#### Get Wallet Details
```http
GET /api/wallet
Authorization: Bearer {token}
```

**Response:**
```json
{
  "address": "0x1234567890abcdef",
  "balance": "1000000000000000000",
  "transactions": 45,
  "createdAt": "2024-01-15T08:00:00Z",
  "publicKey": "0xabcd..."
}
```

### Transactions

#### Send Funds
```http
POST /api/transactions/send
Authorization: Bearer {token}
Content-Type: application/json

{
  "recipient": "0xabcdefghijklmnop",
  "amount": "1000000000000000000",
  "gasPrice": "20000000000",
  "gasLimit": "21000"
}
```

**Response:**
```json
{
  "transactionId": "txn_123456",
  "hash": "0x1234567890abcdef...",
  "status": "pending",
  "amount": "1000000000000000000",
  "fee": "420000000000000",
  "timestamp": "2024-03-29T10:30:00Z"
}
```

#### Get Transaction History
```http
GET /api/transactions?limit=20&offset=0
Authorization: Bearer {token}
```

**Query Parameters:**
- `limit` (optional): Number of transactions to return (default: 20, max: 100)
- `offset` (optional): Pagination offset (default: 0)
- `status` (optional): Filter by status (pending, completed, failed)
- `type` (optional): Filter by type (send, receive)

**Response:**
```json
{
  "transactions": [
    {
      "id": "txn_123456",
      "type": "send",
      "amount": "1000000000000000000",
      "fee": "420000000000000",
      "recipient": "0xabcd...",
      "status": "completed",
      "hash": "0x1234...",
      "timestamp": "2024-03-29T10:30:00Z",
      "confirmations": 12
    }
  ],
  "total": 45,
  "hasMore": true
}
```

#### Get Transaction Details
```http
GET /api/transactions/{transactionId}
Authorization: Bearer {token}
```

**Response:**
```json
{
  "id": "txn_123456",
  "hash": "0x1234567890abcdef...",
  "from": "0xsender...",
  "to": "0xrecipient...",
  "amount": "1000000000000000000",
  "fee": "420000000000000",
  "gasPrice": "20000000000",
  "gasUsed": "21000",
  "status": "completed",
  "confirmations": 12,
  "timestamp": "2024-03-29T10:30:00Z",
  "blockNumber": 19500000,
  "blockHash": "0xblock..."
}
```

### Account Migration

#### Export Account Data
```http
POST /api/migration/export
Authorization: Bearer {token}
Content-Type: application/json

{
  "encryptionPassword": "user_encryption_password",
  "includeTransactionHistory": true,
  "includeSettings": true
}
```

**Response:**
```json
{
  "exportId": "export_123456",
  "dataUrl": "data:application/octet-stream;base64,...",
  "size": 102400,
  "createdAt": "2024-03-29T10:30:00Z",
  "expiresAt": "2024-04-05T10:30:00Z"
}
```

#### Import Account Data
```http
POST /api/migration/import
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: [exported_data_file]
encryptionPassword: "user_encryption_password"
```

**Response:**
```json
{
  "importId": "import_123456",
  "status": "success",
  "itemsImported": {
    "transactions": 45,
    "settings": 1,
    "contacts": 5
  },
  "timestamp": "2024-03-29T10:30:00Z"
}
```

#### Get Migration History
```http
GET /api/migration/history
Authorization: Bearer {token}
```

**Response:**
```json
{
  "migrations": [
    {
      "id": "migration_123456",
      "type": "export",
      "status": "success",
      "timestamp": "2024-03-29T10:30:00Z",
      "deviceInfo": "Chrome on Windows",
      "dataSize": 102400
    }
  ],
  "total": 3
}
```

### Fee Estimation

#### Estimate Transaction Fee
```http
POST /api/fees/estimate
Authorization: Bearer {token}
Content-Type: application/json

{
  "recipient": "0xabcd...",
  "amount": "1000000000000000000",
  "priority": "standard"
}
```

**Response:**
```json
{
  "estimatedFee": "420000000000000",
  "gasPrice": "20000000000",
  "gasLimit": "21000",
  "currency": "WEI",
  "priority": "standard",
  "estimatedTime": "30s",
  "alternatives": [
    {
      "priority": "fast",
      "estimatedFee": "840000000000000",
      "estimatedTime": "15s"
    }
  ]
}
```

### Settings & Preferences

#### Get User Settings
```http
GET /api/settings
Authorization: Bearer {token}
```

**Response:**
```json
{
  "language": "en",
  "theme": "dark",
  "notifications": {
    "email": true,
    "sms": false,
    "push": true
  },
  "twoFactorAuthEnabled": false,
  "securitySettings": {
    "loginAlerts": true,
    "newDeviceAlerts": true
  }
}
```

#### Update Settings
```http
PATCH /api/settings
Authorization: Bearer {token}
Content-Type: application/json

{
  "language": "es",
  "theme": "light",
  "notifications": {
    "email": true,
    "sms": true,
    "push": false
  }
}
```

**Response:**
```json
{
  "message": "Settings updated successfully",
  "settings": {
    "language": "es",
    "theme": "light",
    "notifications": {
      "email": true,
      "sms": true,
      "push": false
    }
  }
}
```

## Error Handling

### Common Error Responses

#### 400 Bad Request
```json
{
  "error": "bad_request",
  "message": "Invalid request parameters",
  "details": {
    "field": "amount",
    "reason": "Amount must be greater than 0"
  }
}
```

#### 401 Unauthorized
```json
{
  "error": "unauthorized",
  "message": "Invalid or missing authentication token"
}
```

#### 403 Forbidden
```json
{
  "error": "forbidden",
  "message": "You do not have permission to access this resource"
}
```

#### 404 Not Found
```json
{
  "error": "not_found",
  "message": "Resource not found"
}
```

#### 429 Too Many Requests
```json
{
  "error": "rate_limited",
  "message": "Too many requests",
  "retryAfter": 60
}
```

#### 500 Internal Server Error
```json
{
  "error": "internal_error",
  "message": "An unexpected error occurred",
  "requestId": "req_123456"
}
```

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Default**: 100 requests per minute per IP
- **Authenticated**: 1000 requests per minute per user
- **Public endpoints**: As specified in endpoint documentation

Rate limit headers:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1711780200
```

## Webhooks

### Supported Events

- `transaction.created` - New transaction initiated
- `transaction.completed` - Transaction confirmed on chain
- `transaction.failed` - Transaction failed
- `account.updated` - Account settings updated
- `migration.completed` - Data migration completed

### Webhook Payload

```json
{
  "id": "evt_123456",
  "type": "transaction.completed",
  "timestamp": "2024-03-29T10:30:00Z",
  "data": {
    "transactionId": "txn_123456",
    "hash": "0x1234...",
    "status": "completed"
  }
}
```

## SDK Documentation

### JavaScript/TypeScript SDK

```typescript
import { WataBoardAPI } from '@wata-board/sdk';

const client = new WataBoardAPI({
  apiKey: 'your_api_key',
  baseURL: 'https://api.wata-board.com'
});

// Send transaction
const transaction = await client.transactions.send({
  recipient: '0xabcd...',
  amount: '1000000000000000000'
});

// Get balance
const balance = await client.wallet.getBalance();

// Export data
const export_ = await client.migration.exportData({
  encryptionPassword: 'password'
});
```

## Best Practices

1. **Authentication**
   - Store tokens securely
   - Implement token refresh logic
   - Never expose tokens in logs or client-side code

2. **Rate Limiting**
   - Implement exponential backoff for retries
   - Cache responses when possible
   - Monitor rate limit headers

3. **Error Handling**
   - Always check error responses
   - Implement proper logging
   - Provide user-friendly error messages

4. **Security**
   - Use HTTPS only
   - Validate all input data
   - Implement CORS properly
   - Use strong encryption for sensitive data

## Support

For API support and documentation updates, visit:
- Documentation: https://docs.wata-board.com
- API Status: https://status.wata-board.com
- Support: support@wata-board.com
