# Payment Gateway Integration Guide

## Overview

This document provides comprehensive instructions for integrating and using the payment gateway system in Wata-Board.

## Supported Payment Providers

- **Stripe** (Currently Implemented) ✅
- **PayPal** (Planned)
- **Flutterwave** (Planned)

## Setup Instructions

### 1. Stripe Configuration

1. Create a Stripe account at https://stripe.com
2. Get your API keys from the Stripe Dashboard:
   - Public Key (Publishable Key)
   - Secret Key
3. Update `.env` file:

```bash
PAYMENT_PROVIDER=stripe
STRIPE_API_KEY=pk_test_your_public_key_here
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### 2. Install Dependencies

```bash
cd backend
npm install stripe
npm install
```

### 3. Start Backend Server

```bash
npm run dev
```

## API Endpoints

### Create Payment Intent

**POST** `/api/payments/intent`

Create a new payment intent for a utility bill payment.

**Request Body:**
```json
{
  "amount": 5000,
  "currency": "USD",
  "customerId": "cust_12345",
  "meterIdId": "METER001",
  "description": "Water Bill Payment",
  "metadata": {
    "billMonth": "December 2024"
  }
}
```

**Response:**
```json
{
  "transactionId": "pi_1234567890",
  "status": "pending",
  "amount": 5000,
  "currency": "USD",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Confirm Payment

**POST** `/api/payments/confirm`

Confirm and process a payment using a payment method.

**Request Body:**
```json
{
  "paymentIntentId": "pi_1234567890",
  "paymentMethodId": "pm_1234567890"
}
```

**Response:**
```json
{
  "transactionId": "pi_1234567890",
  "status": "succeeded",
  "amount": 5000,
  "currency": "USD",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Get Payment Status

**GET** `/api/payments/status/:paymentIntentId`

Retrieve the current status of a payment.

**Response:**
```json
{
  "transactionId": "pi_1234567890",
  "status": "succeeded",
  "amount": 5000,
  "currency": "USD",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Create Payment Method

**POST** `/api/payments/method`

Create and store a payment method for a customer.

**Request Body:**
```json
{
  "cardToken": "tok_visa",
  "customerId": "cust_12345"
}
```

**Response:**
```json
{
  "paymentMethodId": "pm_1234567890"
}
```

### Create Customer

**POST** `/api/payments/customer`

Create a customer record for payment tracking.

**Request Body:**
```json
{
  "email": "user@example.com",
  "customerId": "user_001"
}
```

**Response:**
```json
{
  "customerId": "cus_1234567890"
}
```

## Testing with Stripe Test Cards

Use these test cards for development:

| Card Number | Expiry | CVC | Description |
|-------------|--------|-----|-------------|
| 4242 4242 4242 4242 | Any future date | Any 3-digit | Successful payment |
| 4000 0000 0000 0002 | Any future date | Any 3-digit | Card declined |
| 5555 5555 5555 4444 | Any future date | Any 3-digit | Mastercard |

## Error Handling

The API returns appropriate HTTP status codes:

- **200**: Success
- **201**: Resource created successfully
- **400**: Bad request (missing/invalid fields)
- **500**: Server error

All error responses include an error message:
```json
{
  "error": "Descriptive error message"
}
```

## Security Best Practices

1. **Never expose secret keys** in frontend code
2. **Use HTTPS** in production
3. **Validate all inputs** on the backend
4. **Store sensitive data** securely
5. **Use webhook signatures** for Stripe webhooks
6. **Rotate API keys** regularly

## Integration with Smart Contract

After successful payment via gateway:
1. Verify payment status via `/api/payments/status`
2. Call the Soroban smart contract `pay_bill` method
3. Record the transaction in your database

## Troubleshooting

### Issue: "Stripe API key not found"
**Solution**: Ensure `STRIPE_API_KEY` is set in `.env` file

### Issue: "Invalid request parameters"
**Solution**: Check all required fields are included in request body

### Issue: "Payment intent creation failed"
**Solution**: Verify your Stripe account has proper permissions and API access

## Support

For Stripe-specific issues, refer to: https://stripe.com/docs
