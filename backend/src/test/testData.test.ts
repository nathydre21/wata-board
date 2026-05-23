import { createTestDataFactory, applyTestEnv } from './testData';

describe('test data factory', () => {
  it('creates deterministic payment requests with unique IDs', () => {
    const factory = createTestDataFactory({ seed: 'suite' });

    const requests = factory.paymentRequests(3, (index) => ({
      amount: 50 + index,
      userId: 'shared-user',
    }));

    expect(requests).toEqual([
      expect.objectContaining({
        meter_id: 'METER-002',
        amount: 50,
        userId: 'shared-user',
        nonce: 'suite-nonce-003',
      }),
      expect.objectContaining({
        meter_id: 'METER-005',
        amount: 51,
        userId: 'shared-user',
        nonce: 'suite-nonce-006',
      }),
      expect.objectContaining({
        meter_id: 'METER-008',
        amount: 52,
        userId: 'shared-user',
        nonce: 'suite-nonce-009',
      }),
    ]);
  });

  it('resets generated data for repeatable test setup', () => {
    const factory = createTestDataFactory({ seed: 'reset' });
    const first = factory.paymentRequest();

    factory.reset();

    expect(factory.paymentRequest()).toEqual(first);
  });

  it('creates reusable rate limit config overrides', () => {
    const factory = createTestDataFactory();

    expect(factory.rateLimitConfig({ maxRequests: 2 })).toEqual({
      windowMs: 60_000,
      maxRequests: 2,
      queueSize: 10,
    });
  });

  it('applies and restores test environment values', () => {
    const originalApiKey = process.env.API_KEY;
    const restore = applyTestEnv({ API_KEY: 'override-key', SECRET_KEY: undefined });

    expect(process.env.API_KEY).toBe('override-key');
    expect(process.env.SECRET_KEY).toBeUndefined();

    restore();

    expect(process.env.API_KEY).toBe(originalApiKey);
  });
});
