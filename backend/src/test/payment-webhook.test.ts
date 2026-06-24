import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as envModule from '../utils/env';
import * as webhookService from '../services/paymentWebhookService';
import { PaymentService, PaymentRequest } from '../payment-service';
import { RateLimitConfig } from '../rate-limiter';

// Note: Mocks for '@stellar/stellar-sdk' and '../packages/nepa_client_v2' are defined in src/test/setup.ts

describe('Payment webhook support', () => {
  const validPaymentRequest: PaymentRequest = {
    meter_id: 'METER-001',
    amount: 100,
    userId: 'user123'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    envModule.envConfig.PAYMENT_WEBHOOK_URL = '';
    envModule.envConfig.PAYMENT_WEBHOOK_API_KEY = undefined;
  });

  afterEach(() => {
    envModule.envConfig.PAYMENT_WEBHOOK_URL = '';
    envModule.envConfig.PAYMENT_WEBHOOK_API_KEY = undefined;
  });

  it('should not send a webhook when the URL is not configured', async () => {
    const sendSpy = jest.spyOn(require('https'), 'request');
    await expect(webhookService.notifyPaymentWebhook({
      event: 'payment.completed',
      paymentId: 'pay-test-1',
      transactionId: 'tx-123',
      userId: 'user123',
      meterId: 'METER-001',
      amount: 100,
      status: 'success',
      timestamp: new Date().toISOString()
    })).resolves.toBeUndefined();

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('should send a webhook request when the URL is configured', async () => {
    envModule.envConfig.PAYMENT_WEBHOOK_URL = 'https://example.com/webhook';
    const requestMock: any = {
      on: jest.fn().mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'error') return requestMock;
        return requestMock;
      }),
      write: jest.fn(),
      end: jest.fn()
    };

    const responseMock: any = {
      statusCode: 200,
      on: jest.fn().mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'data') callback('ok');
        if (event === 'end') callback();
        return responseMock;
      })
    };

    const https = require('https');
    const requestSpy = jest.spyOn(https, 'request').mockImplementation((options: any, callback: (response: any) => void) => {
      setImmediate(() => callback(responseMock));
      return requestMock;
    });

    envModule.envConfig.PAYMENT_WEBHOOK_API_KEY = 'secret-api-key';

    await expect(webhookService.notifyPaymentWebhook({
      event: 'payment.completed',
      paymentId: 'pay-test-2',
      transactionId: 'tx-456',
      userId: 'user123',
      meterId: 'METER-001',
      amount: 100,
      status: 'success',
      timestamp: new Date().toISOString()
    })).resolves.toBeUndefined();

    expect(requestSpy).toHaveBeenCalled();
    expect(requestMock.write).toHaveBeenCalled();
    expect(requestMock.end).toHaveBeenCalled();
    const requestOptions = (requestSpy.mock.calls[0][0] || {}) as Record<string, unknown>;
    expect(requestOptions.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-API-Key': 'secret-api-key',
      'User-Agent': 'Wata Board Backend Webhook/1.0'
    });
  });

  it('should call notifyPaymentWebhook during payment processing', async () => {
    const webhookSpy = jest.spyOn(webhookService, 'notifyPaymentWebhook').mockResolvedValue();
    const rateLimitConfig: RateLimitConfig = {
      windowMs: 60000,
      maxRequests: 5,
      queueSize: 10
    };

    const paymentService = new PaymentService(rateLimitConfig);
    const result = await paymentService.processPayment(validPaymentRequest);

    expect((result as any).success).toBe(true);
    expect(webhookSpy).toHaveBeenCalledWith(expect.objectContaining({
      event: 'payment.completed',
      userId: validPaymentRequest.userId,
      meterId: validPaymentRequest.meter_id,
      amount: validPaymentRequest.amount,
      status: 'success'
    }));
  });
});
