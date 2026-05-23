import type { PaymentRequest } from '../payment-service';
import type { RateLimitConfig } from '../rate-limiter';

type EnvValue = string | undefined;

export interface TestUser {
  id: string;
  email: string;
  publicKey: string;
}

export interface TestMeter {
  id: string;
  type: 'electricity' | 'water' | 'gas';
}

export interface TestDataFactoryOptions {
  seed?: string;
}

export class TestDataFactory {
  private sequence = 0;
  private readonly seed: string;

  constructor(options: TestDataFactoryOptions = {}) {
    this.seed = options.seed ?? 'wata-test';
  }

  reset(): void {
    this.sequence = 0;
  }

  user(overrides: Partial<TestUser> = {}): TestUser {
    const id = this.nextId('user');
    return {
      id,
      email: `${id}@example.test`,
      publicKey: 'GTEST1234567890abcdef1234567890abcdef12345678',
      ...overrides,
    };
  }

  meter(overrides: Partial<TestMeter> = {}): TestMeter {
    const index = this.nextSequence();
    return {
      id: `METER-${String(index).padStart(3, '0')}`,
      type: 'electricity',
      ...overrides,
    };
  }

  paymentRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
    const user = this.user();
    const meter = this.meter();

    return {
      meter_id: meter.id,
      amount: 100,
      userId: user.id,
      nonce: this.nextId('nonce'),
      ...overrides,
    };
  }

  paymentRequests(
    count: number,
    overrides: Partial<PaymentRequest> | ((index: number) => Partial<PaymentRequest>) = {},
  ): PaymentRequest[] {
    return Array.from({ length: count }, (_, index) => {
      const resolvedOverrides = typeof overrides === 'function' ? overrides(index) : overrides;
      return this.paymentRequest(resolvedOverrides);
    });
  }

  rateLimitConfig(overrides: Partial<RateLimitConfig> = {}): RateLimitConfig {
    return {
      windowMs: 60_000,
      maxRequests: 5,
      queueSize: 10,
      ...overrides,
    };
  }

  private nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  private nextId(prefix: string): string {
    return `${this.seed}-${prefix}-${String(this.nextSequence()).padStart(3, '0')}`;
  }
}

export function createTestDataFactory(options?: TestDataFactoryOptions): TestDataFactory {
  return new TestDataFactory(options);
}

export function applyTestEnv(overrides: Record<string, EnvValue> = {}): () => void {
  const values: Record<string, EnvValue> = {
    NODE_ENV: 'test',
    PORT: '3001',
    NETWORK: 'testnet',
    CONTRACT_ID_TESTNET: 'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA',
    RPC_URL_TESTNET: 'https://soroban-testnet.stellar.org',
    NETWORK_PASSPHRASE_TESTNET: 'Test SDF Network ; September 2015',
    ADMIN_SECRET_KEY: 'SCZANGBA5RLKJZ65NOCRQSMUXNK3LSNZEOZ5WLBAOWCA6ZXHM7NIYFP4',
    SECRET_KEY: 'SCZANGBA5RLKJZ65NOCRQSMUXNK3LSNZEOZ5WLBAOWCA6ZXHM7NIYFP4',
    API_KEY: 'test-api-key-for-jest-suite',
    ...overrides,
  };

  const previousValues = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    for (const [key, value] of Object.entries(previousValues)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}
