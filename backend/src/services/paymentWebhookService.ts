import http from 'http';
import https from 'https';
import { URL } from 'url';
import { envConfig } from '../utils/env';
import logger from '../utils/logger';

export type PaymentWebhookEvent = 'payment.completed' | 'payment.failed' | 'payment.queued';

export interface PaymentWebhookPayload {
  event: PaymentWebhookEvent;
  paymentId: string;
  transactionId?: string;
  userId: string;
  meterId: string;
  amount: number;
  providerId?: string;
  status: string;
  timestamp: string;
  reason?: string;
  rateLimitInfo?: Record<string, unknown>;
}

function sendJsonWebhook<T>(url: string, payload: T, apiKey?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(url);
      const body = JSON.stringify(payload);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      const request = client.request(
        {
          method: 'POST',
          hostname: parsedUrl.hostname,
          path: `${parsedUrl.pathname}${parsedUrl.search}`,
          port: parsedUrl.port ? Number(parsedUrl.port) : parsedUrl.protocol === 'https:' ? 443 : 80,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Wata Board Backend Webhook/1.0',
            'Content-Length': Buffer.byteLength(body),
            ...(apiKey ? { 'X-API-Key': apiKey } : {}),
          },
        },
        (response) => {
          const status = response.statusCode || 0;
          if (status >= 200 && status < 300) {
            resolve();
          } else {
            reject(new Error(`Webhook delivery failed with status ${status}`));
          }
        },
      );

      request.on('error', reject);
      request.write(body);
      request.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function notifyPaymentWebhook(payload: PaymentWebhookPayload): Promise<void> {
  if (!envConfig.PAYMENT_WEBHOOK_URL) {
    logger.debug('Payment webhook disabled, skipping notification', {
      event: payload.event,
      paymentId: payload.paymentId,
    });
    return;
  }

  try {
    await sendJsonWebhook(envConfig.PAYMENT_WEBHOOK_URL, payload, envConfig.PAYMENT_WEBHOOK_API_KEY);
    logger.info('Payment webhook delivered', {
      webhook: envConfig.PAYMENT_WEBHOOK_URL,
      event: payload.event,
      paymentId: payload.paymentId,
      transactionId: payload.transactionId,
    });
  } catch (error) {
    logger.warn('Payment webhook delivery failed', {
      error,
      webhook: envConfig.PAYMENT_WEBHOOK_URL,
      event: payload.event,
      paymentId: payload.paymentId,
      transactionId: payload.transactionId,
    });
  }
}
