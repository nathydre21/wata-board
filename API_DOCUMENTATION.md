# Wata-Board API Documentation

This document provides comprehensive technical specifications for interacting with the Wata-Board system, including both RESTful APIs and Soroban Smart Contract methods.

## Smart Contract Integration

The Soroban smart contract is the core ledger for all utility payments.

- **Testnet Contract ID**: `CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA`
- **RPC Network**: `https://soroban-testnet.stellar.org`

### Contract Methods

#### 1. `pay_bill`
Records a utility payment against a specific meter.
- **Parameters**:
  - `meter_id` (String): The unique identifier of the utility meter.
  - `amount` (u32): The amount of XLM being paid.
- **Returns**: `Void`
- **Requires**: Must be invoked by an authorized signature.

#### 2. `get_total_paid`
Retrieves the cumulative amount paid for a specific meter.
- **Parameters**:
  - `meter_id` (String): The unique identifier of the utility meter.
- **Returns**: `u32` - Total cumulative XLM paid.

---

## RESTful API Specification

The Backend Express server provides endpoints for rate-limiting, off-chain caching, and payment execution proxies.

### Base URLs
- **Development**: `http://localhost:3001`
- **Production**: `https://api.yourdomain.com`

### Authentication
Standard API interaction requires proper CORS origins. Future administrative endpoints may utilize `Authorization: Bearer <token>`.

---

### OpenAPI / Swagger Specification

You can copy the YAML block below into Swagger Editor for an interactive API explorer experience.

```yaml
openapi: 3.0.0
info:
  title: Wata-Board API
  description: Decentralized utility payment platform backend API
  version: 1.0.0
servers:
  - url: https://api.yourdomain.com
    description: Production server
  - url: http://localhost:3001
    description: Local development server
paths:
  /health:
    get:
      summary: Health Check
      description: Returns the health status of the API.
      responses:
        '200':
          description: API is operational
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: ok
  /api/payment:
    post:
      summary: Process a payment
      description: Validates and processes a utility payment via the Stellar network.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - meter_id
                - amount
                - userId
              properties:
                meter_id:
                  type: string
                  example: "METER-001"
                amount:
                  type: number
                  example: 50.5
                userId:
                  type: string
                  example: "user_abc123"
      responses:
        '200':
          description: Payment processed successfully
        '429':
          description: Rate limit exceeded
  /api/payment/{meterId}:
    get:
      summary: Get Payment Info
      description: Retrieve the total payment sum for a specific meter.
      parameters:
        - in: path
          name: meterId
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Successfully retrieved payment data
  /api/rate-limit/{userId}:
    get:
      summary: Get user rate limit status
      description: Retrieve remaining API calls allowed for the user.
      parameters:
        - in: path
          name: userId
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Rate limit metrics
```

---

## Integration Example

### Submitting a Payment using JavaScript
```javascript
const processPayment = async (meterId, amount, userId) => {
  const response = await fetch('https://api.yourdomain.com/api/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meter_id: meterId, amount, userId })
  });
  return response.json();
};
```