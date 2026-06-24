// Mock environment variables — must be set BEFORE any module that imports envConfig
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.NETWORK = 'testnet';
process.env.CONTRACT_ID_TESTNET = 'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA';
process.env.RPC_URL_TESTNET = 'https://soroban-testnet.stellar.org';
process.env.NETWORK_PASSPHRASE_TESTNET = 'Test SDF Network ; September 2015';
// Required by envConfig validation
process.env.ADMIN_SECRET_KEY = 'SCZANGBA5RLKJZ65NOCRQSMUXNK3LSNZEOZ5WLBAOWCA6ZXHM7NIYFP4';
process.env.SECRET_KEY = process.env.ADMIN_SECRET_KEY; // payment-service.ts alias
process.env.API_KEY = 'test-api-key-for-jest-suite';
process.env.EMAIL_NOTIFICATION_ENABLED = 'true';
process.env.EMAIL_HOST = 'smtp.test.com';
process.env.EMAIL_PORT = '587';
process.env.EMAIL_SECURE = 'false';
process.env.EMAIL_USER = 'test@example.com';
process.env.EMAIL_PASSWORD = 'test-password';

jest.mock('../services/websocketService', () => {
  const actual = jest.requireActual('../services/websocketService') as Record<string, unknown>;
  return {
    ...actual,
    startWebsocketService: jest.fn(),
  };
});

jest.mock('../services/realTimeMonitoringService', () => ({
  __esModule: true,
  default: {
    getRecentAlerts: jest.fn().mockReturnValue([]),
    getThresholds: jest.fn().mockReturnValue({}),
    getConnectedClientsCount: jest.fn().mockReturnValue(0),
    getPerformanceMetrics: jest.fn().mockReturnValue({}),
    stop: jest.fn(),
  },
  realTimeMonitoringService: {
    getRecentAlerts: jest.fn().mockReturnValue([]),
    getThresholds: jest.fn().mockReturnValue({}),
    getConnectedClientsCount: jest.fn().mockReturnValue(0),
    getPerformanceMetrics: jest.fn().mockReturnValue({}),
    stop: jest.fn(),
  },
}));

// Mock Stellar SDK
jest.mock('@stellar/stellar-sdk', () => ({
  Server: jest.fn().mockImplementation(() => ({
    loadAccount: jest.fn().mockResolvedValue({
      accountId: 'GTEST1234567890abcdef1234567890abcdef12345678',
      sequence: '1',
      balances: [{ asset_type: 'native', balance: '1000.0000000' }]
    }),
    submitTransaction: jest.fn().mockResolvedValue({
      hash: 'test_transaction_hash_12345',
      ledger: 12345,
      operations: []
    })
  })),
  TransactionBuilder: jest.fn().mockImplementation(() => ({
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({
      toXDR: jest.fn().mockReturnValue('test_xdr_transaction')
    })
  })),
  Operation: {
    payment: jest.fn().mockReturnValue({ type: 'payment' })
  },
  Asset: {
    native: jest.fn().mockReturnValue({ asset_type: 'native' })
  },
  Keypair: {
    random: jest.fn().mockReturnValue({
      publicKey: jest.fn().mockReturnValue('GDQP2OPQKRERZFOXFQ7DGALBYZW6YBKFXY6FTQUNJL6DDKDEM3GQ62OO'),
      secret: jest.fn().mockReturnValue('SCZANGBA5RLKJZ65NOCRQSMUXNK3LSNZEOZ5WLBAOWCA6ZXHM7NIYFP4X'),
    }),
    fromSecret: jest.fn().mockReturnValue({
      publicKey: jest.fn().mockReturnValue('GDQP2OPQKRERZFOXFQ7DGALBYZW6YBKFXY6FTQUNJL6DDKDEM3GQ62OO'),
      sign: jest.fn()
    })
  },
  Horizon: {
    Server: jest.fn().mockImplementation(() => ({
      root: jest.fn().mockResolvedValue({}),
    })),
  },
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015',
    PUBLIC: 'Public Global Stellar Network ; September 2015'
  },
  BASE_FEE: '100'
}));

// Mock the NEPA client - using virtual: true since the module path might not exist during test time
jest.mock('../packages/nepa_client_v2', () => ({
  Client: jest.fn().mockImplementation(() => ({
    pay_bill: jest.fn().mockResolvedValue({
      hash: 'test_payment_hash_12345',
      result: { success: true },
      signAndSend: jest.fn().mockResolvedValue({}),
    }),
    get_total_paid: jest.fn().mockResolvedValue({
      result: '100.5000000'
    })
  })),
  default: jest.fn().mockImplementation(() => ({
    pay_bill: jest.fn().mockResolvedValue({
      hash: 'test_payment_hash_12345',
      result: { success: true }
    }),
    get_total_paid: jest.fn().mockResolvedValue({
      result: '100.5000000'
    })
  })),
  networks: {
    testnet: {
      networkPassphrase: 'Test SDF Network ; September 2015',
      contractId: 'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA'
    }
  }
}), { virtual: true });

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
