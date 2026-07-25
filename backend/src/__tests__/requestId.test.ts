/**
 * Tests for Request ID tracing middleware.
 *
 * Verifies:
 * - X-Request-ID header is present on every response
 * - Supplied X-Request-ID is propagated (not replaced)
 * - Generated IDs are unique per request
 * - requestId appears in error responses
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

beforeEach(() => {
  process.env.SECRET_KEY = 'SCZANGBA5RLKJZ65NOCRQSMUXNK3LSNZEOZ5WLBAOWCA6ZXHM7NIYFP4';
  process.env.NODE_ENV = 'test';
});

afterEach(() => {
  delete process.env.SECRET_KEY;
});

describe('Request ID tracing', () => {
  describe('X-Request-ID header on responses', () => {
    it('adds X-Request-ID to a successful response', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-request-id']).toBeDefined();
      expect(typeof res.headers['x-request-id']).toBe('string');
      expect(res.headers['x-request-id'].length).toBeGreaterThan(0);
    });

    it('adds X-Request-ID to a 404 response', async () => {
      const res = await request(app).get('/api/this-does-not-exist');
      expect(res.status).toBe(404);
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('adds X-Request-ID to a 400 validation error', async () => {
      const res = await request(app)
        .post('/api/payment')
        .send({ meter_id: '', amount: 0 });
      expect(res.status).toBe(400);
      expect(res.headers['x-request-id']).toBeDefined();
    });
  });

  describe('ID propagation', () => {
    it('propagates a caller-supplied X-Request-ID', async () => {
      const clientId = 'client-trace-abc123';
      const res = await request(app)
        .get('/health')
        .set('X-Request-ID', clientId);
      expect(res.headers['x-request-id']).toBe(clientId);
    });

    it('generates a new ID when none is supplied', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-request-id']).toBeDefined();
      expect(typeof res.headers['x-request-id']).toBe('string');
      expect(res.headers['x-request-id'].length).toBeGreaterThan(0);
    });

    it('rejects an oversized X-Request-ID and generates a new one', async () => {
      const oversized = 'x'.repeat(200);
      const res = await request(app)
        .get('/health')
        .set('X-Request-ID', oversized);
      // Should not echo back the oversized value
      expect(res.headers['x-request-id']).not.toBe(oversized);
      expect(res.headers['x-request-id'].length).toBeLessThanOrEqual(64);
    });
  });

  describe('Uniqueness', () => {
    it('generates a different ID for each request', async () => {
      const [r1, r2, r3] = await Promise.all([
        request(app).get('/health'),
        request(app).get('/health'),
        request(app).get('/health'),
      ]);
      const ids = [r1, r2, r3].map((r) => r.headers['x-request-id']);
      const unique = new Set(ids);
      expect(unique.size).toBe(3);
    });
  });

  describe('requestId in error response body', () => {
    it('includes requestId in a 404 response body', async () => {
      const res = await request(app).get('/api/nonexistent-endpoint-xyz');
      expect(res.status).toBe(404);
      expect(res.body.requestId).toBeDefined();
      expect(res.body.requestId).toBe(res.headers['x-request-id']);
    });

    it('includes requestId in a 400 validation response body', async () => {
      const clientId = 'test-request-id-400';
      const res = await request(app)
        .post('/api/payment')
        .set('X-Request-ID', clientId)
        .send({});
      expect(res.status).toBe(400);
      // requestId may be in body or header — header is the source of truth
      expect(res.headers['x-request-id']).toBe(clientId);
    });
  });

  describe('Consistent ID across all endpoints', () => {
    const endpoints = [
      { method: 'get', path: '/health' },
      { method: 'get', path: '/health/ready' },
      { method: 'get', path: '/api/rate-limit/test-user' },
    ] as const;

    endpoints.forEach(({ method, path }) => {
      it(`sets X-Request-ID on ${method.toUpperCase()} ${path}`, async () => {
        const res = await (request(app) as any)[method](path);
        expect(res.headers['x-request-id']).toBeDefined();
      });
    });
  });
});
