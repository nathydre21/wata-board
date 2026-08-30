/**
 * Fee & Settlement Routes — Backend (#338)
 *
 * Exposes the dynamic fee-estimation + slippage/surge-protection toolkit
 * ({@link ../services/feeEstimationService}) over HTTP:
 *
 *   GET  /api/v{1,2}/fees/estimate                – dynamic per-op + total fee
 *   POST /api/v{1,2}/fees/quote/strict-send        – slippage-protected send quote
 *   POST /api/v{1,2}/fees/quote/strict-receive     – slippage-protected receive quote
 *
 * Validation lives here (mirroring `routes/currency.ts`); all pricing/slippage
 * math and network access stay in the service, which is fully unit-tested.
 */

import { Router, Request, Response } from 'express';
import {
  feeEstimationService,
  DEFAULT_SLIPPAGE_BPS,
  type FeePriority,
  type PathAsset,
} from '../services/feeEstimationService';
import { sanitizeInteger, sanitizeWalletAddress } from '../utils/sanitize';
import logger from '../utils/logger';

const router = Router();

// ── Validation helpers ─────────────────────────────────────

const VALID_PRIORITIES: readonly FeePriority[] = ['low', 'medium', 'high'];

/** Stellar amounts: non-negative, at most 7 decimal places (matches the service). */
const AMOUNT_RE = /^\d+(\.\d{1,7})?$/;
/** Stellar asset codes: 1–12 alphanumerics. */
const ASSET_CODE_RE = /^[A-Za-z0-9]{1,12}$/;
/** Max operations in a single Stellar transaction. */
const MAX_OPERATION_COUNT = 100;

/** Validate a positive Stellar amount string; returns the trimmed string or null. */
function parseAmount(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const s = String(value).trim();
  if (!AMOUNT_RE.test(s)) return null;
  // Reject zero / all-zero amounts — a payment leg must move value.
  if (/^0(\.0+)?$/.test(s)) return null;
  return s;
}

/**
 * Coerce a caller-supplied asset into Horizon `PathAsset` form. Accepts:
 *   • "native" | "XLM"                              → the native asset
 *   • { asset_type, asset_code?, asset_issuer? }     → Horizon shape (passthrough)
 *   • { code, issuer }                               → credit asset (type inferred)
 * Returns null when the shape is unrecognised or a credit asset is malformed.
 */
function parseAsset(input: unknown): PathAsset | null {
  if (typeof input === 'string') {
    const s = input.trim();
    if (s.toLowerCase() === 'native' || s.toUpperCase() === 'XLM') {
      return { asset_type: 'native' };
    }
    return null;
  }
  if (typeof input !== 'object' || input === null) return null;

  const obj = input as Record<string, unknown>;
  const rawType = typeof obj.asset_type === 'string' ? obj.asset_type : undefined;

  if (rawType === 'native') return { asset_type: 'native' };

  // Accept either Horizon field names or the {code, issuer} shorthand.
  const code = (obj.asset_code ?? obj.code) as unknown;
  const issuer = (obj.asset_issuer ?? obj.issuer) as unknown;

  if (typeof code !== 'string' || !ASSET_CODE_RE.test(code)) return null;
  const validIssuer = sanitizeWalletAddress(issuer);
  if (!validIssuer) return null;

  // If asset_type was given explicitly, honour it; otherwise infer from code length.
  const inferred = code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12';
  if (rawType && rawType !== 'credit_alphanum4' && rawType !== 'credit_alphanum12') {
    return null;
  }
  return {
    asset_type: rawType ?? inferred,
    asset_code: code,
    asset_issuer: validIssuer,
  };
}

/**
 * Resolve an optional slippage-bps input to a validated integer in [0, 10000],
 * or the default when omitted. Returns null when supplied but invalid.
 */
function parseSlippageBps(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return DEFAULT_SLIPPAGE_BPS;
  const bps = sanitizeInteger(value, 0, 10_000);
  return Number.isNaN(bps) ? null : bps;
}

/** Map a service error to an HTTP status: "no path" → 422, everything else → 502. */
function respondServiceError(res: Response, err: unknown, context: string): void {
  const message = err instanceof Error ? err.message : String(err);
  if (/no path/i.test(message)) {
    res.status(422).json({ error: message });
    return;
  }
  logger.error(`[fees] ${context} failed`, { error: message });
  res.status(502).json({ error: 'Fee service temporarily unavailable', detail: message });
}

// ── Routes ─────────────────────────────────────────────────

/**
 * GET /estimate?priority=medium&operationCount=1
 * Dynamic per-operation and total inclusion fee from live Horizon fee stats,
 * with surge detection and a hard overpay cap.
 */
router.get('/estimate', async (req: Request, res: Response): Promise<void> => {
  const priorityRaw = typeof req.query.priority === 'string' ? req.query.priority.toLowerCase() : 'medium';
  if (!VALID_PRIORITIES.includes(priorityRaw as FeePriority)) {
    res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` });
    return;
  }

  let operationCount = 1;
  if (req.query.operationCount !== undefined) {
    const n = sanitizeInteger(req.query.operationCount, 1, MAX_OPERATION_COUNT);
    if (Number.isNaN(n)) {
      res.status(400).json({ error: `operationCount must be an integer in [1, ${MAX_OPERATION_COUNT}]` });
      return;
    }
    operationCount = n;
  }

  try {
    const estimate = await feeEstimationService.estimateFee({
      priority: priorityRaw as FeePriority,
      operationCount,
    });
    res.json(estimate);
  } catch (err) {
    respondServiceError(res, err, 'estimate');
  }
});

/**
 * POST /quote/strict-send  { sendAsset, sendAmount, destAsset, slippageBps? }
 * Best-path quote for spending an exact source amount, returning the on-chain
 * `destMin` floor that protects the caller from slippage.
 */
router.post('/quote/strict-send', async (req: Request, res: Response): Promise<void> => {
  const body = req.body ?? {};

  const sendAsset = parseAsset(body.sendAsset);
  const destAsset = parseAsset(body.destAsset);
  const sendAmount = parseAmount(body.sendAmount);
  const slippageBps = parseSlippageBps(body.slippageBps);

  if (!sendAsset) {
    res.status(400).json({ error: 'sendAsset must be "native" or { code, issuer }' });
    return;
  }
  if (!destAsset) {
    res.status(400).json({ error: 'destAsset must be "native" or { code, issuer }' });
    return;
  }
  if (!sendAmount) {
    res.status(400).json({ error: 'sendAmount must be a positive amount with ≤7 decimal places' });
    return;
  }
  if (slippageBps === null) {
    res.status(400).json({ error: 'slippageBps must be an integer in [0, 10000]' });
    return;
  }

  try {
    const quote = await feeEstimationService.quoteStrictSend(sendAsset, sendAmount, destAsset, slippageBps);
    res.json(quote);
  } catch (err) {
    respondServiceError(res, err, 'quote/strict-send');
  }
});

/**
 * POST /quote/strict-receive  { sendAsset, destAsset, destAmount, slippageBps? }
 * Best-path quote for delivering an exact destination amount, returning the
 * on-chain `sendMax` ceiling that caps how much the caller can spend.
 */
router.post('/quote/strict-receive', async (req: Request, res: Response): Promise<void> => {
  const body = req.body ?? {};

  const sendAsset = parseAsset(body.sendAsset);
  const destAsset = parseAsset(body.destAsset);
  const destAmount = parseAmount(body.destAmount);
  const slippageBps = parseSlippageBps(body.slippageBps);

  if (!sendAsset) {
    res.status(400).json({ error: 'sendAsset must be "native" or { code, issuer }' });
    return;
  }
  if (!destAsset) {
    res.status(400).json({ error: 'destAsset must be "native" or { code, issuer }' });
    return;
  }
  if (!destAmount) {
    res.status(400).json({ error: 'destAmount must be a positive amount with ≤7 decimal places' });
    return;
  }
  if (slippageBps === null) {
    res.status(400).json({ error: 'slippageBps must be an integer in [0, 10000]' });
    return;
  }

  try {
    const quote = await feeEstimationService.quoteStrictReceive(sendAsset, destAsset, destAmount, slippageBps);
    res.json(quote);
  } catch (err) {
    respondServiceError(res, err, 'quote/strict-receive');
  }
});

export default router;
