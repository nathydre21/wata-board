/**
 * KYC tier enforcement middleware.
 *
 * Enforces the tier matrix from KycOrchestrationService on payment and refund
 * routes. Reads the authenticated userId from req.user.id (set by upstream
 * auth middleware) and the amount from the request body. On violation it
 * responds 403 with a structured error and emits no PII beyond the code.
 */

import { Request, Response, NextFunction } from 'express';
import {
  KycOrchestrationService,
  KycEnforcementError,
} from '../services/kycOrchestrationService';

export interface KycAuthenticatedRequest extends Request {
  user?: { id: string };
}

function amountFromBody(body: any): number | undefined {
  if (!body) return undefined;
  const candidate = body.amount ?? body.paymentAmount ?? body.value;
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined;
}

export function requirePaymentTier(svc: KycOrchestrationService) {
  return (req: KycAuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    const amount = amountFromBody(req.body);
    if (!userId || amount === undefined) {
      return res.status(400).json({ error: 'KYC_ENFORCEMENT', message: 'userId and amount are required' });
    }
    try {
      svc.assertCanPay(userId, amount);
      return next();
    } catch (err) {
      const e = err as KycEnforcementError;
      const status = e.code === 'KYC_REQUIRED' ? 403 : 422;
      return res.status(status).json({ error: e.code, message: e.message });
    }
  };
}

export function requireRefundTier(svc: KycOrchestrationService) {
  return (req: KycAuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    const amount = amountFromBody(req.body);
    if (!userId || amount === undefined) {
      return res.status(400).json({ error: 'KYC_ENFORCEMENT', message: 'userId and amount are required' });
    }
    try {
      svc.assertCanRefund(userId, amount);
      return next();
    } catch (err) {
      const e = err as KycEnforcementError;
      const status = e.code === 'KYC_REQUIRED' ? 403 : 422;
      return res.status(status).json({ error: e.code, message: e.message });
    }
  };
}
