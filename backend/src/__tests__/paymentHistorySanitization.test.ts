/**
 * Input sanitization tests for GET /api/payment/history
 * Covers all acceptance criteria from issue: sanitize query params,
 * validate date formats, proper error messages, no SQL injection.
 */

import request from 'supertest';
import app from '../server';

jest.mock('../packages/nepa_client_v2', () => ({
  Client: jest.fn().mockImplementation(() => ({
    pay_bill: jest.fn().mockResolvedValue({ hash: 'test_hash', result: { success: true } }),
    get_total_paid: jest.fn().mockResolvedValue({ result: '0' }),
  })),
  networks: { testnet: { networkPassphrase: 'Test SDF Network ; September 2015', contractId: 'TEST' } },
}));

// Mock database so tests don't need a real PostgreSQL instance
jest.mock('../utils/database', () => ({
  database: {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  },
}));

beforeEach(() => {
  process.env.SECRET_KEY = 'SCZANGBA5RLKJZ65NOCRQSMUXNK3LSNZEOZ5WLBAOWCA6ZXHM7NIYFP4';
  process.env.NODE_ENV = 'test';
});

afterEach(() => {
  delete process.env.SECRET_KEY;
  jest.clearAllMocks();
});

const get = (qs: string) =>
  request(app).get('/api/payment/history' + (qs ? '?' + qs : ''));

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
describe('pagination params', () => {
  it('accepts valid page and limit', async () => {
    const res = await get('page=2&limit=10');
    expect(res.status).not.toBe(400);
  });

  it('rejects page=0', async () => {
    const res = await get('page=0');
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'page' })])
    );
  });

  it('rejects page=-1', async () => {
    const res = await get('page=-1');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('page');
  });

  it('rejects non-numeric page', async () => {
    const res = await get('page=abc');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('page');
  });

  it('rejects limit=0', async () => {
    const res = await get('limit=0');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('limit');
  });

  it('rejects limit=101 (above max)', async () => {
    const res = await get('limit=101');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('limit');
  });

  it('rejects non-numeric limit', async () => {
    const res = await get('limit=xyz');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('limit');
  });
});

// ---------------------------------------------------------------------------
// status validation
// ---------------------------------------------------------------------------
describe('status param', () => {
  const valid = ['pending', 'scheduled', 'processing', 'completed', 'failed', 'cancelled', 'paused'];
  valid.forEach((s) => {
    it(`accepts status=${s}`, async () => {
      const res = await get('status=' + s);
      expect(res.status).not.toBe(400);
    });
  });

  it('rejects unknown status value', async () => {
    const res = await get('status=hacked');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('status');
    expect(res.body.errors[0].message).toMatch(/must be one of/i);
  });

  it('rejects SQL injection attempt in status', async () => {
    const res = await get("status=completed'; DROP TABLE payments; --");
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// sortBy validation
// ---------------------------------------------------------------------------
describe('sortBy param', () => {
  const valid = ['date-desc', 'date-asc', 'amount-asc', 'amount-desc'];
  valid.forEach((s) => {
    it(`accepts sortBy=${s}`, async () => {
      const res = await get('sortBy=' + s);
      expect(res.status).not.toBe(400);
    });
  });

  it('rejects unknown sortBy value', async () => {
    const res = await get('sortBy=hacked_column');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('sortBy');
    expect(res.body.errors[0].message).toMatch(/must be one of/i);
  });
});

// ---------------------------------------------------------------------------
// Date format validation
// ---------------------------------------------------------------------------
describe('date params', () => {
  it('accepts a valid YYYY-MM-DD startDate', async () => {
    const res = await get('startDate=2024-01-15');
    expect(res.status).not.toBe(400);
  });

  it('accepts a full ISO 8601 timestamp', async () => {
    const res = await get('startDate=2024-01-15T10:30:00Z');
    expect(res.status).not.toBe(400);
  });

  it('rejects a free-text date string', async () => {
    const res = await get('startDate=January+15+2024');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('startDate');
    expect(res.body.errors[0].message).toMatch(/ISO 8601/i);
  });

  it('rejects a non-date string in startDate', async () => {
    const res = await get('startDate=not-a-date');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('startDate');
  });

  it('rejects an invalid calendar date (Feb 30)', async () => {
    const res = await get('startDate=2024-02-30');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('startDate');
  });

  it('rejects endDate before startDate', async () => {
    const res = await get('startDate=2024-06-01&endDate=2024-01-01');
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'startDate', message: expect.stringMatching(/before or equal/i) })])
    );
  });

  it('accepts startDate equal to endDate', async () => {
    const res = await get('startDate=2024-03-01&endDate=2024-03-01');
    expect(res.status).not.toBe(400);
  });

  it('rejects SQL injection in startDate', async () => {
    const res = await get("startDate=2024-01-01'; DROP TABLE payments; --");
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Numeric range filters
// ---------------------------------------------------------------------------
describe('amount params', () => {
  it('accepts valid minAmount and maxAmount', async () => {
    const res = await get('minAmount=10&maxAmount=500');
    expect(res.status).not.toBe(400);
  });

  it('rejects non-numeric minAmount', async () => {
    const res = await get('minAmount=abc');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('minAmount');
  });

  it('rejects negative minAmount', async () => {
    const res = await get('minAmount=-5');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('minAmount');
  });

  it('rejects minAmount greater than maxAmount', async () => {
    const res = await get('minAmount=500&maxAmount=10');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('minAmount');
    expect(res.body.errors[0].message).toMatch(/less than or equal/i);
  });
});

// ---------------------------------------------------------------------------
// String filters (userId, meterId)
// ---------------------------------------------------------------------------
describe('string filters', () => {
  it('accepts alphanumeric userId', async () => {
    const res = await get('userId=user123');
    expect(res.status).not.toBe(400);
  });

  it('rejects userId with special characters', async () => {
    const res = await get("userId=user'; DROP TABLE users; --");
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('userId');
  });

  it('rejects meterId with special characters', async () => {
    const res = await get('meterId=<script>alert(1)</script>');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('meterId');
  });
});

// ---------------------------------------------------------------------------
// Multiple errors returned at once
// ---------------------------------------------------------------------------
describe('multiple validation errors', () => {
  it('returns all errors in a single response', async () => {
    const res = await get('page=0&limit=0&status=invalid&startDate=bad-date');
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('response shape has success=false and errors array', async () => {
    const res = await get('page=abc');
    expect(res.body.success).toBe(false);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors[0]).toHaveProperty('field');
    expect(res.body.errors[0]).toHaveProperty('message');
  });
});
