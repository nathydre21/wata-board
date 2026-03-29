# Developer Integration Guide

## Getting Started

This guide provides comprehensive instructions for developers to integrate Wata Board into their applications and extend the platform.

## Prerequisites

- Node.js 16+ or Python 3.8+
- npm or yarn package manager
- Git for version control
- Basic understanding of REST APIs and blockchain concepts

## Installation

### Frontend Integration

#### 1. Install SDK Package
```bash
npm install @wata-board/sdk
# or
yarn add @wata-board/sdk
```

#### 2. Initialize the Client

```typescript
import { WataBoardAPI } from '@wata-board/sdk';

const client = new WataBoardAPI({
  apiKey: process.env.WATA_API_KEY,
  baseURL: process.env.WATA_API_URL || 'https://api.wata-board.com',
  network: 'mainnet' // or 'testnet'
});

export default client;
```

#### 3. Environment Configuration

Create a `.env.local` file:
```env
VITE_WATA_API_URL=https://api.wata-board.com
VITE_WATA_API_KEY=your_api_key
VITE_WATA_NETWORK=mainnet
```

### Backend Integration

#### 1. Server-Side Setup

```javascript
const WataBoardAPI = require('@wata-board/sdk').default;

const wataBoardClient = new WataBoardAPI({
  apiKey: process.env.WATA_API_KEY,
  baseURL: process.env.WATA_API_URL,
  network: 'mainnet'
});
```

#### 2. Middleware Integration

```javascript
// Express middleware example
const wataAuthMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }
  
  // Verify token with Wata Board
  wataBoardClient.auth.verifyToken(token)
    .then(user => {
      req.user = user;
      next();
    })
    .catch(err => {
      res.status(401).json({ error: 'Invalid token' });
    });
};

app.use('/api/protected', wataAuthMiddleware);
```

## Core Features

### 1. Wallet Management

#### Create Wallet
```typescript
const wallet = await client.wallet.create({
  name: 'My Wallet',
  publicAddress: '0x...'
});
```

#### Get Balance
```typescript
const balance = await client.wallet.getBalance(walletAddress);
console.log(`Balance: ${balance.balance} ${balance.currency}`);
```

#### List Transactions
```typescript
const transactions = await client.wallet.listTransactions({
  limit: 20,
  offset: 0,
  status: 'completed'
});
```

### 2. Transaction Management

#### Send Funds
```typescript
const tx = await client.transactions.send({
  from: userWallet,
  to: recipientAddress,
  amount: '1000000000000000000', // 1 token in wei
  gasPrice: '20000000000',
  gasLimit: '21000'
});

console.log(`Transaction sent: ${tx.hash}`);
```

#### Monitor Transaction
```typescript
const pollTransaction = async (txHash, maxAttempts = 30) => {
  for (let i = 0; i < maxAttempts; i++) {
    const tx = await client.transactions.getDetails(txHash);
    
    if (tx.status === 'completed') {
      return tx;
    }
    
    // Wait 2 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error('Transaction timeout');
};

const completedTx = await pollTransaction(tx.hash);
```

### 3. Authentication & Security

#### User Login
```typescript
const login = async (email, password) => {
  const response = await client.auth.login({
    email,
    password
  });
  
  // Store token securely
  localStorage.setItem('wata_token', response.token);
  
  return response.user;
};
```

#### Token Refresh
```typescript
const refreshToken = async () => {
  const token = localStorage.getItem('wata_token');
  const newResponse = await client.auth.refreshToken(token);
  localStorage.setItem('wata_token', newResponse.token);
};
```

### 4. Fee Estimation

#### Estimate Transaction Fee
```typescript
const estimate = await client.fees.estimate({
  recipient: recipientAddress,
  amount: '1000000000000000000',
  priority: 'standard' // 'fast', 'standard', 'slow'
});

console.log(`Estimated fee: ${estimate.estimatedFee}`);
console.log(`Estimated time: ${estimate.estimatedTime}`);
```

### 5. Account Migration

#### Export Data
```typescript
const exportData = async (password) => {
  const export_ = await client.migration.exportData({
    encryptionPassword: password,
    includeTransactionHistory: true,
    includeSettings: true
  });
  
  // Create download link
  const link = document.createElement('a');
  link.href = export_.dataUrl;
  link.download = `wata-backup-${Date.now()}.encrypted`;
  link.click();
};
```

#### Import Data
```typescript
const importData = async (file, password) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('encryptionPassword', password);
  
  const result = await client.migration.importData(formData);
  console.log(`Imported ${result.itemsImported.transactions} transactions`);
};
```

## React Integration

### Using the Hook

```typescript
import { useWataBoard } from '@wata-board/react-sdk';

function MyComponent() {
  const { client, isAuthenticated, user } = useWataBoard();
  
  const handleSendTransaction = async () => {
    try {
      const tx = await client.transactions.send({
        to: recipientAddress,
        amount: amount
      });
      
      console.log('Transaction sent:', tx.hash);
    } catch (error) {
      console.error('Transaction failed:', error);
    }
  };
  
  return (
    <button onClick={handleSendTransaction}>
      Send Transaction
    </button>
  );
}
```

### Provider Setup

```typescript
import { WataBoardProvider } from '@wata-board/react-sdk';

function App() {
  return (
    <WataBoardProvider
      apiKey={process.env.REACT_APP_WATA_API_KEY}
      network="mainnet"
    >
      <YourApp />
    </WataBoardProvider>
  );
}
```

## Error Handling

### Handling API Errors

```typescript
import { WataError } from '@wata-board/sdk';

try {
  await client.transactions.send({...});
} catch (error) {
  if (error instanceof WataError) {
    switch (error.code) {
      case 'INSUFFICIENT_BALANCE':
        console.error('Not enough funds');
        break;
      case 'INVALID_ADDRESS':
        console.error('Invalid recipient address');
        break;
      case 'RATE_LIMITED':
        console.error('Rate limited, retry after', error.retryAfter);
        break;
      default:
        console.error('API Error:', error.message);
    }
  }
}
```

## Webhook Integration

### Setting Up Webhook Handlers

```typescript
import express from 'express';

const app = express();

// Verify webhook signature
const verifyWebhookSignature = (req, secret) => {
  const signature = req.headers['x-wata-signature'];
  const body = req.rawBody;
  
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  
  return hash === signature;
};

// Webhook endpoint
app.post('/webhooks/wata', express.raw({ type: 'application/json' }), 
  (req, res) => {
    if (!verifyWebhookSignature(req, process.env.WATA_WEBHOOK_SECRET)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    const event = JSON.parse(req.body);
    
    switch (event.type) {
      case 'transaction.completed':
        handleTransactionCompleted(event.data);
        break;
      case 'transaction.failed':
        handleTransactionFailed(event.data);
        break;
      case 'account.updated':
        handleAccountUpdated(event.data);
        break;
    }
    
    res.json({ received: true });
  }
);
```

## Testing

### Unit Testing

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { WataBoardAPI } from '@wata-board/sdk';

describe('Wata Board Client', () => {
  let client;
  let mockToken;
  
  beforeEach(() => {
    client = new WataBoardAPI({
      apiKey: 'test_key',
      baseURL: 'http://localhost:3000'
    });
    mockToken = 'test_token';
  });
  
  it('should send transaction', async () => {
    const tx = await client.transactions.send({
      to: '0x123456',
      amount: '1000000000000000000'
    });
    
    expect(tx).toHaveProperty('hash');
    expect(tx.status).toBe('pending');
  });
  
  it('should handle transaction errors', async () => {
    expect(() => 
      client.transactions.send({
        to: 'invalid_address',
        amount: '100'
      })
    ).rejects.toThrow();
  });
});
```

## Best Practices

1. **Token Management**
   - Store tokens in secure, HTTPOnly cookies when possible
   - Implement automatic token refresh
   - Clear tokens on logout

2. **Error Handling**
   - Always handle API errors gracefully
   - Provide user-friendly error messages
   - Log errors for debugging

3. **Performance**
   - Cache frequently accessed data
   - Implement pagination for large datasets
   - Use request debouncing for rapid API calls

4. **Security**
   - Never expose API keys in client-side code
   - Use HTTPS only
   - Validate and sanitize all inputs
   - Implement rate limiting on client side

5. **Testing**
   - Write unit tests for API integrations
   - Test error scenarios
   - Use mocks for external API calls

## Support & Resources

- **API Documentation**: https://docs.wata-board.com/api
- **GitHub Repository**: https://github.com/wata-board/sdk
- **Issue Tracker**: https://github.com/wata-board/sdk/issues
- **Community Chat**: https://discord.gg/wata-board
- **Email Support**: developers@wata-board.com
