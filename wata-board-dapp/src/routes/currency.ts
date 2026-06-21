import { Router, Request, Response } from 'express';
import { CurrencyConversionService } from '../services/currencyConversion';

const router = Router();
const currencyService = new CurrencyConversionService();

// POST /api/currency/convert - Convert currency
router.post('/convert', async (req: Request, res: Response) => {
  try {
    const { fromCurrency, toCurrency, amount } = req.body;

    const result = await currencyService.convert({
      fromCurrency,
      toCurrency,
      amount
    });

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Currency conversion error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET /api/currency/supported - Get list of supported currencies
router.get('/supported', (req: Request, res: Response) => {
  try {
    const supportedCurrencies = currencyService.getSupportedCurrencies();
    res.status(200).json({
      success: true,
      data: {
        supportedCurrencies
      }
    });
  } catch (error) {
    console.error('Get supported currencies error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;
