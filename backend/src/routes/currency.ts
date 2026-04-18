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

const router = Router();

/** GET /api/currency/supported */
router.get('/supported', (_req: Request, res: Response) => {
  res.json(currencyConversionService.getSupportedCurrencies());
});

/** GET /api/currency/rate?from=BTC&to=XLM */
router.get('/rate', async (req: Request, res: Response) => {
  try {
    const from = req.query.from as SupportedCurrency;
    const to = req.query.to as SupportedCurrency;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query params are required' });
    }
    const rate = await currencyConversionService.getExchangeRate(from, to);
    res.json(rate);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** POST /api/currency/convert  { amount, fromCurrency } */
router.post('/convert', async (req: Request, res: Response) => {
  try {
    const { amount, fromCurrency } = req.body;
    if (typeof amount !== 'number' || !fromCurrency) {
      return res.status(400).json({ error: 'amount (number) and fromCurrency are required' });
    }
    const result = await currencyConversionService.convertToXLM(amount, fromCurrency);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** GET /api/currency/history?from=BTC&to=XLM&limit=50 */
router.get('/history', (req: Request, res: Response) => {
  const from = req.query.from as SupportedCurrency;
  const to = req.query.to as SupportedCurrency;
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to query params are required' });
  }
  const history = currencyConversionService.getRateHistory(from, to, limit);
  res.json(history);
});

export default router;
