import { Router, Request, Response } from 'express';
import PaymentGatewayService, { PaymentGatewayConfig } from '../services/payment-gateway';

const router = Router();

// Initialize payment gateway service
const gatewayConfig: PaymentGatewayConfig = {
  provider: (process.env.PAYMENT_PROVIDER as 'stripe' | 'paypal' | 'flutterwave') || 'stripe',
  apiKey: process.env.STRIPE_API_KEY || '',
  apiSecret: process.env.STRIPE_SECRET_KEY || '',
};

const paymentService = new PaymentGatewayService(gatewayConfig);

/**
 * POST /api/payments/intent
 * Create a payment intent
 */
router.post('/intent', async (req: Request, res: Response) => {
  try {
    const { amount, currency, customerId, meterIdId, description, metadata } = req.body;

    if (!amount || !currency || !customerId || !meterIdId) {
      res.status(400).json({
        error: 'Missing required fields: amount, currency, customerId, meterIdId',
      });
      return;
    }

    const response = await paymentService.createPaymentIntent({
      amount,
      currency,
      customerId,
      meterId: meterIdId,
      description: description || 'Utility Bill Payment',
      metadata,
    });

    res.status(201).json(response);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Payment intent creation failed',
    });
  }
});

/**
 * POST /api/payments/confirm
 * Confirm a payment
 */
router.post('/confirm', async (req: Request, res: Response) => {
  try {
    const { paymentIntentId, paymentMethodId } = req.body;

    if (!paymentIntentId || !paymentMethodId) {
      res.status(400).json({
        error: 'Missing required fields: paymentIntentId, paymentMethodId',
      });
      return;
    }

    const response = await paymentService.confirmPayment(paymentIntentId, paymentMethodId);

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Payment confirmation failed',
    });
  }
});

/**
 * GET /api/payments/status/:paymentIntentId
 * Get payment status
 */
router.get('/status/:paymentIntentId', async (req: Request, res: Response) => {
  try {
    const { paymentIntentId } = req.params;

    if (!paymentIntentId) {
      res.status(400).json({ error: 'paymentIntentId is required' });
      return;
    }

    const response = await paymentService.retrievePaymentStatus(paymentIntentId);

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to retrieve payment status',
    });
  }
});

/**
 * POST /api/payments/method
 * Create a payment method
 */
router.post('/method', async (req: Request, res: Response) => {
  try {
    const { cardToken, customerId } = req.body;

    if (!cardToken || !customerId) {
      res.status(400).json({
        error: 'Missing required fields: cardToken, customerId',
      });
      return;
    }

    const response = await paymentService.createPaymentMethod(cardToken, customerId);

    res.status(201).json(response);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create payment method',
    });
  }
});

/**
 * POST /api/payments/customer
 * Create a customer record
 */
router.post('/customer', async (req: Request, res: Response) => {
  try {
    const { email, customerId } = req.body;

    if (!email || !customerId) {
      res.status(400).json({
        error: 'Missing required fields: email, customerId',
      });
      return;
    }

    const response = await paymentService.createCustomer(email, customerId);

    res.status(201).json(response);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create customer',
    });
  }
});

export default router;
