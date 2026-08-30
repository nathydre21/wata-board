/**
 * HTTP tests for the fee & settlement routes (#338).
 *
 * The service is mocked so these tests exercise the routing, input validation,
 * and error-status mapping in isolation — no Horizon, no network.
 */

import express from 'express';
import request from 'supertest';

jest.mock('../services/feeEstimationService', () => ({
  __esModule: true,
  DEFAULT_SLIPPAGE_BPS: 50,
  feeEstimationService: {
    estimateFee: jest.fn(),
    quoteStrictSend: jest.fn(),
    quoteStrictReceive: jest.fn(),
  },
}));

import feesRouter from '../routes/fees';
import { feeEstimationService } from '../services/feeEstimationService';
import logger from '../utils/logger';

const svc = feeEstimationService as unknown as {
  estimateFee: jest.Mock;
  quoteStrictSend: jest.Mock;
  quoteStrictReceive: jest.Mock;
};

const app = express();
app.use(express.json());
app.use('/api/v1/fees', feesRouter);

// A syntactically valid Stellar public key (format only; no checksum needed here).
const ISSUER = 'G' + 'A'.repeat(55);
const USDC = { code: 'USDC', issuer: ISSUER };
const USDC_PATH_ASSET = { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: ISSUER };

beforeAll(() => {
  jest.spyOn(logger, 'error').mockImplementation(() => logger as never);
  jest.spyOn(logger, 'warn').mockImplementation(() => logger as never);
});
afterAll(() => jest.restoreAllMocks());
beforeEach(() => {
  svc.estimateFee.mockReset();
  svc.quoteStrictSend.mockReset();
  svc.quoteStrictReceive.mockReset();
});

describe('GET /api/v1/fees/estimate', () => {
  it('returns an estimate using medium/1 defaults', async () => {
    const sample = { feePerOperationStroops: '150', totalFeeStroops: '150', priority: 'medium' };
    svc.estimateFee.mockResolvedValue(sample);
    const res = await request(app).get('/api/v1/fees/estimate');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(sample);
    expect(svc.estimateFee).toHaveBeenCalledWith({ priority: 'medium', operationCount: 1 });
  });

  it('passes priority and operationCount through', async () => {
    svc.estimateFee.mockResolvedValue({});
    await request(app).get('/api/v1/fees/estimate?priority=high&operationCount=5');
    expect(svc.estimateFee).toHaveBeenCalledWith({ priority: 'high', operationCount: 5 });
  });

  it('rejects an invalid priority with 400 and never calls the service', async () => {
    const res = await request(app).get('/api/v1/fees/estimate?priority=urgent');
    expect(res.status).toBe(400);
    expect(svc.estimateFee).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', 'abc', '101'])('rejects operationCount=%s with 400', async (oc) => {
    const res = await request(app).get(`/api/v1/fees/estimate?operationCount=${oc}`);
    expect(res.status).toBe(400);
    expect(svc.estimateFee).not.toHaveBeenCalled();
  });

  it('maps an upstream failure to 502', async () => {
    svc.estimateFee.mockRejectedValue(new Error('horizon unreachable'));
    const res = await request(app).get('/api/v1/fees/estimate');
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/unavailable/i);
  });
});

describe('POST /api/v1/fees/quote/strict-send', () => {
  const validBody = { sendAsset: 'native', sendAmount: '100', destAsset: USDC };

  it('returns a quote and normalises assets + default slippage', async () => {
    const quote = { type: 'strict_send', destMin: '99.5' };
    svc.quoteStrictSend.mockResolvedValue(quote);
    const res = await request(app).post('/api/v1/fees/quote/strict-send').send(validBody);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(quote);
    expect(svc.quoteStrictSend).toHaveBeenCalledWith(
      { asset_type: 'native' },
      '100',
      USDC_PATH_ASSET,
      50,
    );
  });

  it('honours an explicit slippageBps', async () => {
    svc.quoteStrictSend.mockResolvedValue({});
    await request(app).post('/api/v1/fees/quote/strict-send').send({ ...validBody, slippageBps: 100 });
    expect(svc.quoteStrictSend).toHaveBeenCalledWith(expect.anything(), '100', expect.anything(), 100);
  });

  it.each([
    ['missing sendAmount', { sendAsset: 'native', destAsset: USDC }],
    ['zero sendAmount', { sendAsset: 'native', sendAmount: '0', destAsset: USDC }],
    ['too many decimals', { sendAsset: 'native', sendAmount: '1.123456789', destAsset: USDC }],
    ['bad issuer', { sendAsset: 'native', sendAmount: '100', destAsset: { code: 'USDC', issuer: 'GABC' } }],
    ['unknown asset shape', { sendAsset: 42, sendAmount: '100', destAsset: 'native' }],
    ['out-of-range slippage', { sendAsset: 'native', sendAmount: '100', destAsset: USDC, slippageBps: 10001 }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await request(app).post('/api/v1/fees/quote/strict-send').send(body as Record<string, unknown>);
    expect(res.status).toBe(400);
    expect(svc.quoteStrictSend).not.toHaveBeenCalled();
  });

  it('maps a "no path" service error to 422', async () => {
    svc.quoteStrictSend.mockRejectedValue(new Error('No path found for strict-send settlement'));
    const res = await request(app).post('/api/v1/fees/quote/strict-send').send(validBody);
    expect(res.status).toBe(422);
  });

  it('maps an unexpected service error to 502', async () => {
    svc.quoteStrictSend.mockRejectedValue(new Error('horizon 500'));
    const res = await request(app).post('/api/v1/fees/quote/strict-send').send(validBody);
    expect(res.status).toBe(502);
  });
});

describe('POST /api/v1/fees/quote/strict-receive', () => {
  const validBody = { sendAsset: 'native', destAsset: USDC, destAmount: '100' };

  it('returns a quote and normalises assets', async () => {
    const quote = { type: 'strict_receive', sendMax: '100.5' };
    svc.quoteStrictReceive.mockResolvedValue(quote);
    const res = await request(app).post('/api/v1/fees/quote/strict-receive').send(validBody);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(quote);
    expect(svc.quoteStrictReceive).toHaveBeenCalledWith(
      { asset_type: 'native' },
      USDC_PATH_ASSET,
      '100',
      50,
    );
  });

  it('rejects a missing destAmount with 400', async () => {
    const res = await request(app)
      .post('/api/v1/fees/quote/strict-receive')
      .send({ sendAsset: 'native', destAsset: USDC });
    expect(res.status).toBe(400);
    expect(svc.quoteStrictReceive).not.toHaveBeenCalled();
  });

  it('maps a "no path" service error to 422', async () => {
    svc.quoteStrictReceive.mockRejectedValue(new Error('No path found for strict-receive settlement'));
    const res = await request(app).post('/api/v1/fees/quote/strict-receive').send(validBody);
    expect(res.status).toBe(422);
  });
});
