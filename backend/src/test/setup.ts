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
    fromSecret: jest.fn().mockReturnValue({
      publicKey: jest.fn().mockReturnValue('GTEST1234567890abcdef1234567890abcdef12345678'),
      sign: jest.fn()
    })
  },
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015',
    PUBLIC: 'Public Global Stellar Network ; September 2015'
  },
  BASE_FEE: '100'
}));

// Mock the NEPA client
jest.mock('../packages/nepa_client_v2', () => ({
  Client: jest.fn().mockImplementation(() => ({
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
}));

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
