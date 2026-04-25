/**
 * Currency Routes — Backend (#94)
 *
 * /api/currency/supported  – list supported currencies
 * /api/currency/rate        – get exchange rate for a pair
 * /api/currency/convert     – estimate conversion to XLM
 * /api/currency/history     – historical rate data for a pair
 */

import { Router, Request, Response } from 'express';
import { currencyConversionService, SupportedCurrency } from '../services/currencyConversion';
import { sanitizeCurrency, sanitizePositiveNumber, sanitizeInteger } from '../utils/sanitize';

const router = Router();

/** GET /api/currency/supported */
router.get('/supported', (_req: Request, res: Response) => {
  res.json(currencyConversionService.getSupportedCurrencies());
});

/** GET /api/currency/rate?from=BTC&to=XLM */
router.get('/rate', async (req: Request, res: Response): Promise<void> => {
  try {
    const from = sanitizeCurrency(req.query.from) as SupportedCurrency;
    const to = sanitizeCurrency(req.query.to) as SupportedCurrency;
    if (!from || !to) {
      res.status(400).json({ error: 'from and to must be valid supported currency codes' });
      return;
    }
    const rate = await currencyConversionService.getExchangeRate(from, to);
    res.json(rate);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** POST /api/currency/convert  { amount, fromCurrency } */
router.post('/convert', async (req: Request, res: Response): Promise<void> => {
  try {
    const amount = sanitizePositiveNumber(req.body.amount);
    const fromCurrency = sanitizeCurrency(req.body.fromCurrency) as SupportedCurrency;
    if (Number.isNaN(amount)) {
      res.status(400).json({ error: 'amount must be a positive number' });
      return;
    }
    if (!fromCurrency) {
      res.status(400).json({ error: 'fromCurrency must be a valid supported currency code' });
      return;
    }
    const result = await currencyConversionService.convertToXLM(amount, fromCurrency);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** GET /api/currency/history?from=BTC&to=XLM&limit=50 */
router.get('/history', (req: Request, res: Response): void => {
  const from = sanitizeCurrency(req.query.from) as SupportedCurrency;
  const to = sanitizeCurrency(req.query.to) as SupportedCurrency;
  const rawLimit = sanitizeInteger(req.query.limit, 1, 200);
  const limit = Number.isNaN(rawLimit) ? 50 : rawLimit;

  if (!from || !to) {
    res.status(400).json({ error: 'from and to must be valid supported currency codes' });
    return;
  }
  const history = currencyConversionService.getRateHistory(from, to, limit);
  res.json(history);
});

export default router;
