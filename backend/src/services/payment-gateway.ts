import Stripe from 'stripe';

export interface PaymentGatewayConfig {
  provider: 'stripe' | 'paypal' | 'flutterwave';
  apiKey: string;
  apiSecret?: string;
}

export interface PaymentRequest {
  amount: number; // in cents/smallest unit
  currency: string;
  customerId: string;
  meterId: string;
  description: string;
  metadata?: Record<string, string>;
}

export interface PaymentResponse {
  transactionId: string;
  status: 'pending' | 'success' | 'failed';
  amount: number;
  currency: string;
  timestamp: Date;
}

export class PaymentGatewayService {
  private stripe: Stripe;
  private provider: string;

  constructor(config: PaymentGatewayConfig) {
    this.provider = config.provider;
    
    if (config.provider === 'stripe') {
      this.stripe = new Stripe(config.apiKey, { apiVersion: '2023-10-16' });
    } else {
      throw new Error(`Payment provider ${config.provider} not yet implemented`);
    }
  }

  async createPaymentIntent(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: request.amount,
        currency: request.currency,
        metadata: {
          meterId: request.meterId,
          customerId: request.customerId,
          ...request.metadata,
        },
        description: request.description,
      });

      return {
        transactionId: intent.id,
        status: intent.status as 'pending' | 'success' | 'failed',
        amount: intent.amount,
        currency: intent.currency,
        timestamp: new Date(),
      };
    } catch (error) {
      throw new Error(`Payment intent creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async retrievePaymentStatus(paymentIntentId: string): Promise<PaymentResponse> {
    try {
      const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

      return {
        transactionId: intent.id,
        status: intent.status as 'pending' | 'success' | 'failed',
        amount: intent.amount,
        currency: intent.currency,
        timestamp: new Date(intent.created * 1000),
      };
    } catch (error) {
      throw new Error(`Failed to retrieve payment status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async confirmPayment(paymentIntentId: string, paymentMethodId: string): Promise<PaymentResponse> {
    try {
      const intent = await this.stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: paymentMethodId,
      });

      return {
        transactionId: intent.id,
        status: intent.status as 'pending' | 'success' | 'failed',
        amount: intent.amount,
        currency: intent.currency,
        timestamp: new Date(intent.created * 1000),
      };
    } catch (error) {
      throw new Error(`Payment confirmation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createPaymentMethod(
    cardToken: string,
    customerId: string
  ): Promise<{ paymentMethodId: string }> {
    try {
      const paymentMethod = await this.stripe.paymentMethods.create({
        type: 'card',
        card: { token: cardToken },
      });

      await this.stripe.paymentMethods.attach(paymentMethod.id, { customer: customerId });

      return { paymentMethodId: paymentMethod.id };
    } catch (error) {
      throw new Error(`Failed to create payment method: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createCustomer(email: string, customerId: string): Promise<{ customerId: string }> {
    try {
      const customer = await this.stripe.customers.create({
        email,
        metadata: { customerId },
      });

      return { customerId: customer.id };
    } catch (error) {
      throw new Error(`Failed to create customer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default PaymentGatewayService;
