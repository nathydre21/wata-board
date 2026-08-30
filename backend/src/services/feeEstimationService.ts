/**
 * Fee Estimation & Slippage / Surge Protection — Backend (#338)
 *
 * A cohesive toolkit for building safe Stellar path payments and multi-asset
 * settlement:
 *
 *   • Dynamic fee estimation from Horizon fee statistics (per-priority
 *     percentiles), so we pay what the network actually needs — no more, no
 *     less.
 *   • Surge-pricing detection with a HARD per-operation fee cap, so a congested
 *     ledger can never drain fees beyond a configured ceiling.
 *   • Slippage bounds (`destMin` for strict-send, `sendMax` for strict-receive)
 *     computed with exact integer-stroop math (no floating-point drift).
 *   • Best-path selection over Horizon path-finding results and slippage-
 *     protected quotes for multi-asset settlement, plus helpers that turn a
 *     quote into a stellar-sdk path-payment operation.
 *
 * Design: every unit of pricing/slippage logic is a PURE function with no I/O,
 * mirroring `services/providerRouter.ts`. All network access (Horizon fee stats
 * and path-finding) is injected via {@link FeeEstimationDeps}, and the
 * operation builders accept an injectable SDK, so the whole module is unit-
 * testable without Stellar and without network.
 */

import type { Asset, Horizon } from '@stellar/stellar-sdk';
import logger from '../utils/logger';
import { envConfig } from '../utils/env';

// Type-only view of the SDK module (erased at compile time — no eager import).
type StellarSdkModule = typeof import('@stellar/stellar-sdk');
/** The slice of the SDK the operation builders need (injectable for tests). */
export type StellarSdkLike = Pick<StellarSdkModule, 'Asset' | 'Operation'>;

// ── Types ──────────────────────────────────────────────────

export type FeePriority = 'low' | 'medium' | 'high';

/** The subset of Horizon's `FeeStatsResponse` this module consumes. */
export interface FeeStatsLike {
  /** Base fee of the most recent ledger, in stroops (string). */
  last_ledger_base_fee: string;
  /** Fraction of ledger capacity used, "0.0".."1.0" (string). */
  ledger_capacity_usage: string;
  /** Charged-fee distribution: percentile key ("p10".."p99"/"min"/"max"/"mode") → stroops. */
  fee_charged: Record<string, string>;
}

/** A Stellar asset in Horizon path-record form. */
export interface PathAsset {
  /** 'native' | 'credit_alphanum4' | 'credit_alphanum12'. */
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
}

/** One record from Horizon strict-send / strict-receive path finding. */
export interface PathRecordLike {
  source_asset_type: string;
  source_asset_code?: string;
  source_asset_issuer?: string;
  source_amount: string;
  destination_asset_type: string;
  destination_asset_code?: string;
  destination_asset_issuer?: string;
  destination_amount: string;
  path: PathAsset[];
}

export interface SurgeInfo {
  /** True when ledger capacity usage is at/above the surge threshold. */
  active: boolean;
  /** Ledger capacity usage 0..1 from the latest fee stats. */
  ledgerCapacityUsage: number;
  /** Suggested backoff before retrying (ms); 0 when no surge. */
  recommendedBackoffMs: number;
}

export interface FeeEstimate {
  /** Per-operation inclusion fee, in stroops (string — Stellar's fee unit). */
  feePerOperationStroops: string;
  /** Total inclusion fee for the whole transaction (feePerOp × operations). */
  totalFeeStroops: string;
  operationCount: number;
  priority: FeePriority;
  /** Which fee-stats percentile the estimate was taken from (e.g. "p50"). */
  percentileUsed: string;
  /** Network base fee (stroops) reported by the latest ledger. */
  baseFeeStroops: string;
  /** True when the raw percentile fee was clamped down to the max cap (surge protection). */
  cappedByMax: boolean;
  surge: SurgeInfo;
  timestamp: number;
}

export interface FeeEstimationConfig {
  /** Floor for the per-op fee; defaults to Stellar BASE_FEE (100 stroops). */
  minFeePerOperationStroops: number;
  /** HARD cap for the per-op fee — the core surge protection. */
  maxFeePerOperationStroops: number;
  /** `ledger_capacity_usage` at/above which surge pricing is considered active. */
  surgeCapacityThreshold: number;
  /** Backoff suggested to callers when a surge is detected. */
  surgeBackoffMs: number;
  /** Percentile of `fee_charged` used for each priority. */
  priorityPercentiles: Record<FeePriority, string>;
}

export interface StrictSendQuote {
  type: 'strict_send';
  sendAsset: PathAsset;
  sendAmount: string;
  destAsset: PathAsset;
  /** Best (maximum) destination amount found across candidate paths. */
  quotedDestAmount: string;
  /** Minimum acceptable destination amount after slippage (the on-chain `destMin`). */
  destMin: string;
  slippageBps: number;
  path: PathAsset[];
  timestamp: number;
}

export interface StrictReceiveQuote {
  type: 'strict_receive';
  sendAsset: PathAsset;
  /** Maximum amount of the send asset we will spend after slippage (the on-chain `sendMax`). */
  sendMax: string;
  /** Best (minimum) source amount found across candidate paths. */
  quotedSendAmount: string;
  destAsset: PathAsset;
  destAmount: string;
  slippageBps: number;
  path: PathAsset[];
  timestamp: number;
}

// ── Constants ──────────────────────────────────────────────

/** Stellar base fee in stroops (mirrors `@stellar/stellar-sdk` BASE_FEE = "100"). */
export const BASE_FEE_STROOPS = 100;

/** 1 XLM = 10,000,000 stroops; Stellar amounts carry at most 7 decimal places. */
const STROOPS_PER_UNIT = 10_000_000n;

export const DEFAULT_FEE_CONFIG: FeeEstimationConfig = {
  minFeePerOperationStroops: BASE_FEE_STROOPS,
  maxFeePerOperationStroops: 100_000, // 0.01 XLM per op — overpay ceiling
  surgeCapacityThreshold: 0.75,
  surgeBackoffMs: 5_000,
  priorityPercentiles: { low: 'p10', medium: 'p50', high: 'p90' },
};

/** Default slippage tolerance for quotes when a caller does not specify one. */
export const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%

// ── Exact stroop math ──────────────────────────────────────

/** Parse a decimal Stellar amount ("12.5") to integer stroops. Throws on malformed input. */
export function amountToStroops(amount: string): bigint {
  const trimmed = String(amount).trim();
  if (!/^\d+(\.\d{1,7})?$/.test(trimmed)) {
    throw new Error(`Invalid Stellar amount "${amount}" (expected non-negative, ≤7 decimal places)`);
  }
  const [whole, frac = ''] = trimmed.split('.');
  const fracPadded = (frac + '0000000').slice(0, 7);
  return BigInt(whole) * STROOPS_PER_UNIT + BigInt(fracPadded);
}

/** Format integer stroops back to a 7-dp decimal string, trimming trailing zeros. */
export function stroopsToAmount(stroops: bigint): string {
  if (stroops < 0n) throw new Error('stroops must be non-negative');
  const whole = stroops / STROOPS_PER_UNIT;
  const frac = stroops % STROOPS_PER_UNIT;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(7, '0').replace(/0+$/, '');
  return `${whole.toString()}.${fracStr}`;
}

function assertSlippageBps(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new Error(`slippageBps must be an integer in [0, 10000]; got ${bps}`);
  }
}

// ── Slippage protection ────────────────────────────────────

/**
 * `destMin` for a strict-send path payment = destAmount × (1 − slippage).
 * Floors, so we never demand more than the tolerance allows.
 */
export function computeDestMin(destAmount: string, slippageBps: number): string {
  assertSlippageBps(slippageBps);
  const stroops = amountToStroops(destAmount);
  const min = (stroops * BigInt(10_000 - slippageBps)) / 10_000n; // floor
  return stroopsToAmount(min);
}

/**
 * `sendMax` for a strict-receive path payment = sendAmount × (1 + slippage).
 * Ceils, so the cap is never accidentally tighter than the tolerance allows.
 */
export function computeSendMax(sendAmount: string, slippageBps: number): string {
  assertSlippageBps(slippageBps);
  const stroops = amountToStroops(sendAmount);
  const numerator = stroops * BigInt(10_000 + slippageBps);
  const max = (numerator + 9_999n) / 10_000n; // ceil
  return stroopsToAmount(max);
}

// ── Dynamic fee estimation + surge detection ───────────────

function mergeConfig(partial?: Partial<FeeEstimationConfig>): FeeEstimationConfig {
  return {
    ...DEFAULT_FEE_CONFIG,
    ...partial,
    priorityPercentiles: {
      ...DEFAULT_FEE_CONFIG.priorityPercentiles,
      ...(partial?.priorityPercentiles ?? {}),
    },
  };
}

/** Detect surge pricing from the latest fee stats. */
export function detectSurge(
  stats: FeeStatsLike,
  config: FeeEstimationConfig = DEFAULT_FEE_CONFIG,
): SurgeInfo {
  const parsed = Number(stats?.ledger_capacity_usage);
  const ledgerCapacityUsage = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0;
  const active = ledgerCapacityUsage >= config.surgeCapacityThreshold;
  return {
    active,
    ledgerCapacityUsage,
    recommendedBackoffMs: active ? config.surgeBackoffMs : 0,
  };
}

/**
 * Compute a per-operation and total inclusion fee from Horizon fee stats.
 *
 * Starts from the `fee_charged` percentile mapped to the requested priority,
 * falls back to the ledger base fee when a percentile is missing/invalid,
 * enforces the minimum floor, and — crucially — clamps to the configured
 * maximum so surge pricing can never push the fee past the ceiling.
 */
export function estimateFeeFromStats(
  stats: FeeStatsLike,
  opts: {
    priority?: FeePriority;
    operationCount?: number;
    config?: Partial<FeeEstimationConfig>;
  } = {},
): FeeEstimate {
  const config = mergeConfig(opts.config);
  const priority: FeePriority = opts.priority ?? 'medium';
  const operationCount = Math.max(1, Math.trunc(opts.operationCount ?? 1));

  const percentileUsed = config.priorityPercentiles[priority];

  const parsedBase = Number(stats?.last_ledger_base_fee);
  const baseFeeStroops =
    Number.isFinite(parsedBase) && parsedBase > 0 ? parsedBase : config.minFeePerOperationStroops;

  const parsedPercentile = Number(stats?.fee_charged?.[percentileUsed]);
  let feePerOp =
    Number.isFinite(parsedPercentile) && parsedPercentile > 0 ? parsedPercentile : baseFeeStroops;

  // Enforce the floor.
  feePerOp = Math.max(feePerOp, config.minFeePerOperationStroops);

  // Surge protection: never exceed the hard cap.
  const cappedByMax = feePerOp > config.maxFeePerOperationStroops;
  if (cappedByMax) feePerOp = config.maxFeePerOperationStroops;

  feePerOp = Math.round(feePerOp);

  const totalFeeStroops = (BigInt(feePerOp) * BigInt(operationCount)).toString();

  return {
    feePerOperationStroops: String(feePerOp),
    totalFeeStroops,
    operationCount,
    priority,
    percentileUsed,
    baseFeeStroops: String(Math.round(baseFeeStroops)),
    cappedByMax,
    surge: detectSurge(stats, config),
    timestamp: Date.now(),
  };
}

// ── Path selection + quotes (multi-asset settlement) ───────

/** Pick the path yielding the MOST destination asset (best for strict-send). */
export function selectBestStrictSendPath(paths: PathRecordLike[]): PathRecordLike | null {
  if (!paths || paths.length === 0) return null;
  return paths.reduce((best, p) =>
    amountToStroops(p.destination_amount) > amountToStroops(best.destination_amount) ? p : best,
  );
}

/** Pick the path costing the LEAST source asset (best for strict-receive). */
export function selectBestStrictReceivePath(paths: PathRecordLike[]): PathRecordLike | null {
  if (!paths || paths.length === 0) return null;
  return paths.reduce((best, p) =>
    amountToStroops(p.source_amount) < amountToStroops(best.source_amount) ? p : best,
  );
}

/** Build a slippage-protected strict-send quote from candidate paths. */
export function buildStrictSendQuote(
  sendAsset: PathAsset,
  sendAmount: string,
  destAsset: PathAsset,
  paths: PathRecordLike[],
  slippageBps: number = DEFAULT_SLIPPAGE_BPS,
): StrictSendQuote {
  assertSlippageBps(slippageBps);
  const best = selectBestStrictSendPath(paths);
  if (!best) throw new Error('No path found for strict-send settlement');
  return {
    type: 'strict_send',
    sendAsset,
    sendAmount,
    destAsset,
    quotedDestAmount: best.destination_amount,
    destMin: computeDestMin(best.destination_amount, slippageBps),
    slippageBps,
    path: best.path ?? [],
    timestamp: Date.now(),
  };
}

/** Build a slippage-protected strict-receive quote from candidate paths. */
export function buildStrictReceiveQuote(
  sendAsset: PathAsset,
  destAsset: PathAsset,
  destAmount: string,
  paths: PathRecordLike[],
  slippageBps: number = DEFAULT_SLIPPAGE_BPS,
): StrictReceiveQuote {
  assertSlippageBps(slippageBps);
  const best = selectBestStrictReceivePath(paths);
  if (!best) throw new Error('No path found for strict-receive settlement');
  return {
    type: 'strict_receive',
    sendAsset,
    quotedSendAmount: best.source_amount,
    sendMax: computeSendMax(best.source_amount, slippageBps),
    destAsset,
    destAmount,
    slippageBps,
    path: best.path ?? [],
    timestamp: Date.now(),
  };
}

// ── Operation builders (dynamic SDK; injectable for tests) ──

function toAsset(AssetCtor: StellarSdkModule['Asset'], a: PathAsset): Asset {
  if (a.asset_type === 'native') return AssetCtor.native();
  if (!a.asset_code || !a.asset_issuer) {
    throw new Error('Non-native asset requires both asset_code and asset_issuer');
  }
  return new AssetCtor(a.asset_code, a.asset_issuer);
}

async function loadSdk(): Promise<StellarSdkLike> {
  return import('@stellar/stellar-sdk');
}

/**
 * Turn a strict-send quote into a `pathPaymentStrictSend` operation. `sdk` is
 * injectable for tests; in production it is dynamically imported.
 */
export async function buildStrictSendOperation(
  quote: StrictSendQuote,
  destination: string,
  sdk?: StellarSdkLike,
) {
  const { Asset: AssetCtor, Operation } = sdk ?? (await loadSdk());
  return Operation.pathPaymentStrictSend({
    sendAsset: toAsset(AssetCtor, quote.sendAsset),
    sendAmount: quote.sendAmount,
    destination,
    destAsset: toAsset(AssetCtor, quote.destAsset),
    destMin: quote.destMin,
    path: (quote.path ?? []).map((a) => toAsset(AssetCtor, a)),
  });
}

/**
 * Turn a strict-receive quote into a `pathPaymentStrictReceive` operation.
 * `sdk` is injectable for tests; in production it is dynamically imported.
 */
export async function buildStrictReceiveOperation(
  quote: StrictReceiveQuote,
  destination: string,
  sdk?: StellarSdkLike,
) {
  const { Asset: AssetCtor, Operation } = sdk ?? (await loadSdk());
  return Operation.pathPaymentStrictReceive({
    sendAsset: toAsset(AssetCtor, quote.sendAsset),
    sendMax: quote.sendMax,
    destination,
    destAsset: toAsset(AssetCtor, quote.destAsset),
    destAmount: quote.destAmount,
    path: (quote.path ?? []).map((a) => toAsset(AssetCtor, a)),
  });
}

// ── Service (network deps injected) ────────────────────────

export interface FeeEstimationDeps {
  /** Fetch the latest Horizon fee statistics. */
  getFeeStats: () => Promise<FeeStatsLike>;
  /** Find strict-send paths (source asset+amount → destination asset). */
  findStrictSendPaths: (
    sendAsset: PathAsset,
    sendAmount: string,
    destAsset: PathAsset,
  ) => Promise<PathRecordLike[]>;
  /** Find strict-receive paths (source asset → destination asset+amount). */
  findStrictReceivePaths: (
    sendAsset: PathAsset,
    destAsset: PathAsset,
    destAmount: string,
  ) => Promise<PathRecordLike[]>;
}

export class FeeEstimationService {
  constructor(
    private readonly deps: FeeEstimationDeps,
    private readonly config: FeeEstimationConfig = DEFAULT_FEE_CONFIG,
  ) {}

  /** Dynamic fee estimate for `operationCount` operations at the given priority. */
  async estimateFee(
    opts: { priority?: FeePriority; operationCount?: number } = {},
  ): Promise<FeeEstimate> {
    const stats = await this.deps.getFeeStats();
    const estimate = estimateFeeFromStats(stats, { ...opts, config: this.config });
    if (estimate.surge.active) {
      logger.warn('[FeeEstimation] Surge pricing detected', {
        ledgerCapacityUsage: estimate.surge.ledgerCapacityUsage,
        feePerOperationStroops: estimate.feePerOperationStroops,
        cappedByMax: estimate.cappedByMax,
      });
    }
    return estimate;
  }

  /** Slippage-protected strict-send quote for multi-asset settlement. */
  async quoteStrictSend(
    sendAsset: PathAsset,
    sendAmount: string,
    destAsset: PathAsset,
    slippageBps: number = DEFAULT_SLIPPAGE_BPS,
  ): Promise<StrictSendQuote> {
    const paths = await this.deps.findStrictSendPaths(sendAsset, sendAmount, destAsset);
    return buildStrictSendQuote(sendAsset, sendAmount, destAsset, paths, slippageBps);
  }

  /** Slippage-protected strict-receive quote for multi-asset settlement. */
  async quoteStrictReceive(
    sendAsset: PathAsset,
    destAsset: PathAsset,
    destAmount: string,
    slippageBps: number = DEFAULT_SLIPPAGE_BPS,
  ): Promise<StrictReceiveQuote> {
    const paths = await this.deps.findStrictReceivePaths(sendAsset, destAsset, destAmount);
    return buildStrictReceiveQuote(sendAsset, destAsset, destAmount, paths, slippageBps);
  }
}

// ── Default wiring (Horizon via dynamic import + envConfig) ─

function defaultHorizonUrl(): string {
  if (process.env.HORIZON_URL) return process.env.HORIZON_URL;
  return envConfig.NETWORK === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';
}

/** Build Horizon-backed deps. The server is created lazily on first use. */
export function createHorizonDeps(horizonUrl: string = defaultHorizonUrl()): FeeEstimationDeps {
  let serverPromise: Promise<Horizon.Server> | null = null;
  const getServer = (): Promise<Horizon.Server> => {
    if (!serverPromise) {
      serverPromise = (async () => {
        const { Horizon: HorizonNS } = await import('@stellar/stellar-sdk');
        return new HorizonNS.Server(horizonUrl);
      })();
    }
    return serverPromise;
  };

  const assetsFor = async (assets: PathAsset[]): Promise<Asset[]> => {
    const { Asset: AssetCtor } = await import('@stellar/stellar-sdk');
    return assets.map((a) => toAsset(AssetCtor, a));
  };

  return {
    async getFeeStats() {
      const server = await getServer();
      const stats = await server.feeStats();
      return stats as unknown as FeeStatsLike;
    },
    async findStrictSendPaths(sendAsset, sendAmount, destAsset) {
      const server = await getServer();
      const [src, dst] = await assetsFor([sendAsset, destAsset]);
      const res = await server.strictSendPaths(src, sendAmount, [dst]).call();
      return ((res as any).records ?? []) as PathRecordLike[];
    },
    async findStrictReceivePaths(sendAsset, destAsset, destAmount) {
      const server = await getServer();
      const [src, dst] = await assetsFor([sendAsset, destAsset]);
      const res = await server.strictReceivePaths([src], dst, destAmount).call();
      return ((res as any).records ?? []) as PathRecordLike[];
    },
  };
}

/** Default, Horizon-backed singleton for route/runtime use. */
export const feeEstimationService = new FeeEstimationService(createHorizonDeps());
