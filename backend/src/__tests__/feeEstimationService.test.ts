/**
 * Unit tests for the fee-estimation / slippage / surge-protection toolkit (#338).
 *
 * Every case here is pure and offline: pricing and slippage are exercised on
 * plain objects, the service class is driven through injected deps, and the
 * operation builders receive an injected fake SDK — no Horizon, no network.
 */

import {
  amountToStroops,
  stroopsToAmount,
  computeDestMin,
  computeSendMax,
  detectSurge,
  estimateFeeFromStats,
  selectBestStrictSendPath,
  selectBestStrictReceivePath,
  buildStrictSendQuote,
  buildStrictReceiveQuote,
  buildStrictSendOperation,
  buildStrictReceiveOperation,
  FeeEstimationService,
  DEFAULT_FEE_CONFIG,
  DEFAULT_SLIPPAGE_BPS,
  BASE_FEE_STROOPS,
  type FeeStatsLike,
  type PathRecordLike,
  type PathAsset,
  type StrictSendQuote,
  type StrictReceiveQuote,
  type StellarSdkLike,
} from '../services/feeEstimationService';
import logger from '../utils/logger';

// ── Fixtures ───────────────────────────────────────────────

const NATIVE: PathAsset = { asset_type: 'native' };
const USDC: PathAsset = {
  asset_type: 'credit_alphanum4',
  asset_code: 'USDC',
  asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
};

function makeStats(overrides: Partial<FeeStatsLike> = {}): FeeStatsLike {
  return {
    last_ledger_base_fee: '100',
    ledger_capacity_usage: '0.2',
    fee_charged: { min: '100', p10: '100', p50: '150', p90: '2000', max: '5000', mode: '100' },
    ...overrides,
  };
}

// ── Exact stroop math ──────────────────────────────────────

describe('amountToStroops / stroopsToAmount', () => {
  it.each([
    ['0', 0n],
    ['1', 10_000_000n],
    ['1.5', 15_000_000n],
    ['0.0000001', 1n],
    ['100', 1_000_000_000n],
    ['123.4567891', 1_234_567_891n],
  ])('parses %s to %s stroops', (amount, stroops) => {
    expect(amountToStroops(amount as string)).toBe(stroops);
  });

  it.each([
    [0n, '0'],
    [10_000_000n, '1'],
    [15_000_000n, '1.5'],
    [1n, '0.0000001'],
    [1_234_567_891n, '123.4567891'],
  ])('formats %s stroops to %s', (stroops, amount) => {
    expect(stroopsToAmount(stroops as bigint)).toBe(amount);
  });

  it('round-trips arbitrary 7-dp amounts', () => {
    for (const a of ['0.1', '9999.9999999', '42', '0.0000009']) {
      expect(stroopsToAmount(amountToStroops(a))).toBe(a);
    }
  });

  it.each(['1.12345678', '-1', 'abc', '', '1.2.3', '  '])(
    'rejects malformed amount %s',
    (bad) => {
      expect(() => amountToStroops(bad)).toThrow(/Invalid Stellar amount/);
    },
  );

  it('rejects negative stroops when formatting', () => {
    expect(() => stroopsToAmount(-1n)).toThrow(/non-negative/);
  });
});

// ── Slippage protection ────────────────────────────────────

describe('computeDestMin (strict-send floor)', () => {
  it('applies slippage and floors', () => {
    expect(computeDestMin('100', 50)).toBe('99.5'); // -0.5%
    expect(computeDestMin('100', 0)).toBe('100');
    expect(computeDestMin('100', 10_000)).toBe('0'); // -100%
  });

  it('floors sub-stroop results down (never demands more than tolerance)', () => {
    // 1 stroop * (1 - 0.5%) = 0.995 stroop → floor 0
    expect(computeDestMin('0.0000001', 50)).toBe('0');
  });

  it.each([-1, 10_001, 1.5, NaN])('rejects invalid slippageBps %s', (bps) => {
    expect(() => computeDestMin('100', bps as number)).toThrow(/slippageBps/);
  });
});

describe('computeSendMax (strict-receive ceil)', () => {
  it('applies slippage and ceils', () => {
    expect(computeSendMax('100', 50)).toBe('100.5'); // +0.5%
    expect(computeSendMax('100', 0)).toBe('100');
    expect(computeSendMax('50', 100)).toBe('50.5'); // +1%
  });

  it('ceils sub-stroop results up (cap never tighter than tolerance)', () => {
    // 1 stroop * (1 + 0.5%) = 1.005 stroop → ceil 2
    expect(computeSendMax('0.0000001', 50)).toBe('0.0000002');
  });

  it.each([-1, 10_001, 2.5])('rejects invalid slippageBps %s', (bps) => {
    expect(() => computeSendMax('100', bps as number)).toThrow(/slippageBps/);
  });
});

// ── Surge detection ────────────────────────────────────────

describe('detectSurge', () => {
  it('is inactive below the threshold', () => {
    const s = detectSurge(makeStats({ ledger_capacity_usage: '0.5' }));
    expect(s).toMatchObject({ active: false, ledgerCapacityUsage: 0.5, recommendedBackoffMs: 0 });
  });

  it('is active at/above the threshold and suggests backoff', () => {
    expect(detectSurge(makeStats({ ledger_capacity_usage: '0.75' })).active).toBe(true);
    const s = detectSurge(makeStats({ ledger_capacity_usage: '0.9' }));
    expect(s.active).toBe(true);
    expect(s.recommendedBackoffMs).toBe(DEFAULT_FEE_CONFIG.surgeBackoffMs);
  });

  it('clamps usage to [0,1] and treats non-numeric as 0', () => {
    expect(detectSurge(makeStats({ ledger_capacity_usage: '1.5' })).ledgerCapacityUsage).toBe(1);
    expect(detectSurge(makeStats({ ledger_capacity_usage: '-0.3' })).ledgerCapacityUsage).toBe(0);
    expect(detectSurge(makeStats({ ledger_capacity_usage: 'nope' })).ledgerCapacityUsage).toBe(0);
  });
});

// ── Dynamic fee estimation ─────────────────────────────────

describe('estimateFeeFromStats', () => {
  it('uses the p50 percentile for medium priority by default', () => {
    const est = estimateFeeFromStats(makeStats());
    expect(est).toMatchObject({
      feePerOperationStroops: '150',
      totalFeeStroops: '150',
      operationCount: 1,
      priority: 'medium',
      percentileUsed: 'p50',
      baseFeeStroops: '100',
      cappedByMax: false,
    });
    expect(est.surge.active).toBe(false);
  });

  it('maps priority to percentile (low→p10, high→p90)', () => {
    expect(estimateFeeFromStats(makeStats(), { priority: 'low' }).feePerOperationStroops).toBe('100');
    expect(estimateFeeFromStats(makeStats(), { priority: 'high' }).feePerOperationStroops).toBe('2000');
  });

  it('multiplies per-op fee by operationCount for the total', () => {
    const est = estimateFeeFromStats(makeStats(), { operationCount: 3 });
    expect(est.operationCount).toBe(3);
    expect(est.totalFeeStroops).toBe('450');
  });

  it('enforces the minimum floor', () => {
    const est = estimateFeeFromStats(makeStats({ fee_charged: { p50: '40' } }));
    expect(est.feePerOperationStroops).toBe(String(BASE_FEE_STROOPS)); // floored up to 100
  });

  it('clamps to the hard max cap (surge protection) and flags it', () => {
    const est = estimateFeeFromStats(makeStats(), {
      priority: 'high', // p90 = 2000
      config: { maxFeePerOperationStroops: 500 },
    });
    expect(est.feePerOperationStroops).toBe('500');
    expect(est.cappedByMax).toBe(true);
  });

  it('falls back to the ledger base fee when the percentile is missing', () => {
    const est = estimateFeeFromStats(makeStats({ fee_charged: {}, last_ledger_base_fee: '250' }));
    expect(est.feePerOperationStroops).toBe('250');
  });

  it('falls back to the min floor when the base fee is invalid too', () => {
    const est = estimateFeeFromStats(
      makeStats({ fee_charged: {}, last_ledger_base_fee: 'garbage' }),
    );
    expect(est.feePerOperationStroops).toBe(String(BASE_FEE_STROOPS));
  });

  it('embeds live surge info', () => {
    const est = estimateFeeFromStats(makeStats({ ledger_capacity_usage: '0.95' }));
    expect(est.surge.active).toBe(true);
  });
});

// ── Path selection ─────────────────────────────────────────

function sendPath(destAmount: string): PathRecordLike {
  return {
    source_asset_type: 'native',
    source_amount: '10',
    destination_asset_type: 'credit_alphanum4',
    destination_asset_code: 'USDC',
    destination_amount: destAmount,
    path: [],
  };
}
function receivePath(sourceAmount: string): PathRecordLike {
  return {
    source_asset_type: 'native',
    source_amount: sourceAmount,
    destination_asset_type: 'credit_alphanum4',
    destination_asset_code: 'USDC',
    destination_amount: '100',
    path: [],
  };
}

describe('path selection', () => {
  it('strict-send picks the MOST destination asset', () => {
    const best = selectBestStrictSendPath([sendPath('10'), sendPath('25'), sendPath('20')]);
    expect(best?.destination_amount).toBe('25');
  });

  it('strict-receive picks the LEAST source asset', () => {
    const best = selectBestStrictReceivePath([receivePath('10'), receivePath('7'), receivePath('9')]);
    expect(best?.source_amount).toBe('7');
  });

  it('returns null for an empty path set', () => {
    expect(selectBestStrictSendPath([])).toBeNull();
    expect(selectBestStrictReceivePath([])).toBeNull();
  });
});

// ── Quotes ─────────────────────────────────────────────────

describe('buildStrictSendQuote', () => {
  it('quotes the best destination amount with a slippage-protected destMin', () => {
    const q = buildStrictSendQuote(NATIVE, '100', USDC, [sendPath('150'), sendPath('200')], 50);
    expect(q).toMatchObject({
      type: 'strict_send',
      quotedDestAmount: '200',
      destMin: '199', // 200 * (1 - 0.5%)
      slippageBps: 50,
    });
  });

  it('throws when no path exists', () => {
    expect(() => buildStrictSendQuote(NATIVE, '100', USDC, [])).toThrow(/No path/);
  });
});

describe('buildStrictReceiveQuote', () => {
  it('quotes the cheapest source amount with a slippage-protected sendMax', () => {
    const q = buildStrictReceiveQuote(NATIVE, USDC, '100', [receivePath('60'), receivePath('50')], 100);
    expect(q).toMatchObject({
      type: 'strict_receive',
      quotedSendAmount: '50',
      sendMax: '50.5', // 50 * (1 + 1%)
      slippageBps: 100,
    });
  });

  it('throws when no path exists', () => {
    expect(() => buildStrictReceiveQuote(NATIVE, USDC, '100', [])).toThrow(/No path/);
  });
});

// ── Operation builders (injected fake SDK) ─────────────────

function makeFakeSdk() {
  const pathPaymentStrictSend = jest.fn((p) => ({ op: 'strictSend', ...p }));
  const pathPaymentStrictReceive = jest.fn((p) => ({ op: 'strictReceive', ...p }));
  class FakeAsset {
    constructor(public code?: string, public issuer?: string) {}
    static native() {
      return { kind: 'native' };
    }
  }
  const sdk = {
    Asset: FakeAsset,
    Operation: { pathPaymentStrictSend, pathPaymentStrictReceive },
  } as unknown as StellarSdkLike;
  return { sdk, pathPaymentStrictSend, pathPaymentStrictReceive };
}

describe('operation builders', () => {
  const DEST = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

  it('builds a pathPaymentStrictSend op forwarding destMin, amount and path', async () => {
    const { sdk, pathPaymentStrictSend } = makeFakeSdk();
    const quote: StrictSendQuote = {
      type: 'strict_send',
      sendAsset: NATIVE,
      sendAmount: '100',
      destAsset: USDC,
      quotedDestAmount: '200',
      destMin: '199',
      slippageBps: 50,
      path: [],
      timestamp: 1,
    };
    await buildStrictSendOperation(quote, DEST, sdk);
    expect(pathPaymentStrictSend).toHaveBeenCalledTimes(1);
    expect(pathPaymentStrictSend.mock.calls[0][0]).toMatchObject({
      sendAmount: '100',
      destMin: '199',
      destination: DEST,
    });
  });

  it('builds a pathPaymentStrictReceive op forwarding sendMax and amount', async () => {
    const { sdk, pathPaymentStrictReceive } = makeFakeSdk();
    const quote: StrictReceiveQuote = {
      type: 'strict_receive',
      sendAsset: NATIVE,
      sendMax: '50.5',
      quotedSendAmount: '50',
      destAsset: USDC,
      destAmount: '100',
      slippageBps: 100,
      path: [],
      timestamp: 1,
    };
    await buildStrictReceiveOperation(quote, DEST, sdk);
    expect(pathPaymentStrictReceive).toHaveBeenCalledTimes(1);
    expect(pathPaymentStrictReceive.mock.calls[0][0]).toMatchObject({
      sendMax: '50.5',
      destAmount: '100',
      destination: DEST,
    });
  });

  it('rejects a non-native asset missing code/issuer', async () => {
    const { sdk } = makeFakeSdk();
    const quote: StrictSendQuote = {
      type: 'strict_send',
      sendAsset: NATIVE,
      sendAmount: '100',
      destAsset: { asset_type: 'credit_alphanum4' }, // no code/issuer
      quotedDestAmount: '200',
      destMin: '199',
      slippageBps: 50,
      path: [],
      timestamp: 1,
    };
    await expect(buildStrictSendOperation(quote, DEST, sdk)).rejects.toThrow(
      /requires both asset_code and asset_issuer/,
    );
  });
});

// ── Service (injected deps) ────────────────────────────────

describe('FeeEstimationService', () => {
  const stats = makeStats();

  function makeDeps() {
    return {
      getFeeStats: jest.fn().mockResolvedValue(stats),
      findStrictSendPaths: jest.fn().mockResolvedValue([sendPath('200')]),
      findStrictReceivePaths: jest.fn().mockResolvedValue([receivePath('50')]),
    };
  }

  afterEach(() => jest.restoreAllMocks());

  it('estimateFee reads live stats and honours priority', async () => {
    const deps = makeDeps();
    const svc = new FeeEstimationService(deps);
    const est = await svc.estimateFee({ priority: 'high' });
    expect(deps.getFeeStats).toHaveBeenCalledTimes(1);
    expect(est.percentileUsed).toBe('p90');
    expect(est.feePerOperationStroops).toBe('2000');
  });

  it('estimateFee warns when a surge is active', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const deps = makeDeps();
    deps.getFeeStats.mockResolvedValue(makeStats({ ledger_capacity_usage: '0.99' }));
    const svc = new FeeEstimationService(deps);
    const est = await svc.estimateFee();
    expect(est.surge.active).toBe(true);
    expect(warn).toHaveBeenCalledWith('[FeeEstimation] Surge pricing detected', expect.any(Object));
  });

  it('honours a custom config max cap', async () => {
    const deps = makeDeps();
    const svc = new FeeEstimationService(deps, { ...DEFAULT_FEE_CONFIG, maxFeePerOperationStroops: 120 });
    const est = await svc.estimateFee({ priority: 'high' }); // raw p90 = 2000
    expect(est.feePerOperationStroops).toBe('120');
    expect(est.cappedByMax).toBe(true);
  });

  it('quoteStrictSend delegates to path-finding and protects destMin', async () => {
    const deps = makeDeps();
    const svc = new FeeEstimationService(deps);
    const q = await svc.quoteStrictSend(NATIVE, '100', USDC, 50);
    expect(deps.findStrictSendPaths).toHaveBeenCalledWith(NATIVE, '100', USDC);
    expect(q.destMin).toBe('199');
  });

  it('quoteStrictReceive delegates to path-finding and protects sendMax', async () => {
    const deps = makeDeps();
    const svc = new FeeEstimationService(deps);
    const q = await svc.quoteStrictReceive(NATIVE, USDC, '100', 100);
    expect(deps.findStrictReceivePaths).toHaveBeenCalledWith(NATIVE, USDC, '100');
    expect(q.sendMax).toBe('50.5');
  });

  it('defaults slippage to DEFAULT_SLIPPAGE_BPS', async () => {
    const deps = makeDeps();
    const svc = new FeeEstimationService(deps);
    const q = await svc.quoteStrictSend(NATIVE, '100', USDC);
    expect(q.slippageBps).toBe(DEFAULT_SLIPPAGE_BPS);
  });
});
