import { Router, Request, Response } from 'express';
import PaymentGatewayService, { PaymentGatewayConfig } from '../services/payment-gateway';
import { asyncRoute, badRequest } from '../utils/asyncRouteHandler';

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
router.post('/intent', asyncRoute(async (req: Request, res: Response) => {
  const { amount, currency, customerId, meterIdId, description, metadata } = req.body;

  if (!amount || !currency || !customerId || !meterIdId) {
    throw badRequest('Missing required fields: amount, currency, customerId, meterIdId');
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
}));

router.post('/confirm', asyncRoute(async (req: Request, res: Response) => {
  const { paymentIntentId, paymentMethodId } = req.body;

  if (!paymentIntentId || !paymentMethodId) {
    throw badRequest('Missing required fields: paymentIntentId, paymentMethodId');
  }

  const response = await paymentService.confirmPayment(paymentIntentId, paymentMethodId);

  res.status(200).json(response);
}));

router.get('/status/:paymentIntentId', asyncRoute(async (req: Request, res: Response) => {
  const { paymentIntentId } = req.params;

  if (!paymentIntentId) {
    throw badRequest('paymentIntentId is required');
  }

  const response = await paymentService.retrievePaymentStatus(paymentIntentId);

  res.status(200).json(response);
}));

router.post('/method', asyncRoute(async (req: Request, res: Response) => {
  const { cardToken, customerId } = req.body;

  if (!cardToken || !customerId) {
    throw badRequest('Missing required fields: cardToken, customerId');
  }

  const response = await paymentService.createPaymentMethod(cardToken, customerId);

  res.status(201).json(response);
}));

router.post('/customer', asyncRoute(async (req: Request, res: Response) => {
  const { email, customerId } = req.body;

  if (!email || !customerId) {
    throw badRequest('Missing required fields: email, customerId');
  }

  const response = await paymentService.createCustomer(email, customerId);

  res.status(201).json(response);
}));

export default router;
