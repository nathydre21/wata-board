/**
 * WebSocket security primitives (#368)
 *
 * This module centralises the security-sensitive logic used by the WebSocket
 * service so it can be unit-tested in isolation and reused consistently:
 *
 *   - JWT verification (HS256/384/512) with no third-party dependency
 *   - Origin allow-listing to prevent Cross-Site WebSocket Hijacking (CSWSH)
 *   - Connection-level rate limiting (per-IP concurrency + new-connection rate)
 *   - Client IP extraction that is aware of reverse proxies
 *   - Security metrics counters for monitoring/alerting
 *
 * The functions here are intentionally free of `ws` types so they can be
 * exercised directly from tests without opening real sockets.
 */

import crypto from 'crypto';
import { IncomingMessage } from 'http';
import logger from '../utils/logger';
import { config } from '../config/appConfig';
import { userTierService } from './userTierService';
import { UserTier } from '../types/userTier';

// ─────────────────────────────────────────────────────────────
// JWT verification (zero-dependency HS256/384/512)
// ─────────────────────────────────────────────────────────────
//
// We deliberately avoid pulling in `jsonwebtoken` here: the backend already
// tracks its dependency-audit surface (see issue #363), and a self-contained
// HMAC verifier keeps that surface minimal. Only symmetric HMAC algorithms are
// supported; the insecure "none" algorithm is always rejected.

const HMAC_ALGO_MAP: Record<string, string> = {
  HS256: 'sha256',
  HS384: 'sha384',
  HS512: 'sha512',
};

export interface JwtVerifyOptions {
  /** Allowed signing algorithms. Defaults to ['HS256']. */
  algorithms?: string[];
  /** Clock skew tolerance in seconds for exp/nbf checks. Defaults to 5. */
  clockToleranceSec?: number;
  /** Expected `iss` claim, if issuer validation is required. */
  issuer?: string;
  /** Expected `aud` claim(s), if audience validation is required. */
  audience?: string | string[];
  /** Override "now" (seconds since epoch) — used by tests. */
  now?: number;
}

export interface JwtVerifyResult {
  valid: boolean;
  payload?: Record<string, any>;
  error?: string;
}

/** Decode a base64url segment into a Buffer. */
function base64UrlToBuffer(segment: string): Buffer {
  const padLength = segment.length % 4 === 0 ? 0 : 4 - (segment.length % 4);
  const base64 = (segment + '='.repeat(padLength)).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

/**
 * Verify a compact JWS (JWT) signed with an HMAC algorithm.
 *
 * Returns `{ valid: true, payload }` on success, otherwise
 * `{ valid: false, error }` with a machine-readable reason. The function never
 * throws for malformed input — untrusted tokens are data, not control flow.
 */
export function verifyJwt(token: string, secret: string, options: JwtVerifyOptions = {}): JwtVerifyResult {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'missing_token' };
  }
  if (!secret) {
    return { valid: false, error: 'no_secret_configured' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'malformed_token' };
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: Record<string, any>;
  try {
    header = JSON.parse(base64UrlToBuffer(headerB64).toString('utf8'));
  } catch {
    return { valid: false, error: 'invalid_header' };
  }

  const allowedAlgorithms = options.algorithms && options.algorithms.length ? options.algorithms : ['HS256'];
  if (!header || typeof header.alg !== 'string') {
    return { valid: false, error: 'invalid_alg' };
  }
  // "none" is a well-known JWT downgrade attack vector — reject unconditionally.
  if (header.alg.toLowerCase() === 'none') {
    return { valid: false, error: 'alg_none_forbidden' };
  }
  if (!allowedAlgorithms.includes(header.alg)) {
    return { valid: false, error: `alg_not_allowed:${header.alg}` };
  }
  const hashAlgo = HMAC_ALGO_MAP[header.alg];
  if (!hashAlgo) {
    return { valid: false, error: `unsupported_alg:${header.alg}` };
  }

  // Constant-time signature comparison.
  const signingInput = `${headerB64}.${payloadB64}`;
  const expected = crypto.createHmac(hashAlgo, secret).update(signingInput).digest();
  const provided = base64UrlToBuffer(signatureB64);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return { valid: false, error: 'invalid_signature' };
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(base64UrlToBuffer(payloadB64).toString('utf8'));
  } catch {
    return { valid: false, error: 'invalid_payload' };
  }

  const nowSec = typeof options.now === 'number' ? options.now : Math.floor(Date.now() / 1000);
  const skew = typeof options.clockToleranceSec === 'number' ? options.clockToleranceSec : 5;

  if (typeof payload.exp === 'number' && nowSec > payload.exp + skew) {
    return { valid: false, error: 'token_expired' };
  }
  if (typeof payload.nbf === 'number' && nowSec + skew < payload.nbf) {
    return { valid: false, error: 'token_not_active' };
  }
  if (options.issuer && payload.iss !== options.issuer) {
    return { valid: false, error: 'invalid_issuer' };
  }
  if (options.audience) {
    const expectedAud = Array.isArray(options.audience) ? options.audience : [options.audience];
    const tokenAud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!expectedAud.some(a => tokenAud.includes(a))) {
      return { valid: false, error: 'invalid_audience' };
    }
  }

  return { valid: true, payload };
}

// ─────────────────────────────────────────────────────────────
// Origin allow-listing (CSWSH protection)
// ─────────────────────────────────────────────────────────────

export interface OriginValidationResult {
  allowed: boolean;
  reason?: string;
}

/** Lower-case an origin and strip a single trailing slash for comparison. */
export function normalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, '');
}

/**
 * Resolve the effective WebSocket origin allow-list.
 *
 * Priority: `WS_ALLOWED_ORIGINS` (comma-separated) → the shared HTTP CORS
 * allow-list (`config.cors.allowedOrigins`). Reading lazily (rather than at
 * import time) keeps the function responsive to env changes in tests.
 */
export function getAllowedOrigins(): string[] {
  const raw = process.env.WS_ALLOWED_ORIGINS;
  if (raw && raw.trim().length > 0) {
    return raw.split(',').map(o => o.trim()).filter(Boolean);
  }
  return config.cors.allowedOrigins ?? [];
}

/**
 * Decide whether a WebSocket upgrade from `origin` should be accepted.
 *
 * Browsers always send an `Origin` header, so a *missing* origin denotes a
 * non-browser client (native app, server-to-server) which is not subject to
 * CSWSH. Such clients are allowed unless `WS_STRICT_ORIGIN=true`. A `*` entry
 * in the allow-list disables origin checking entirely.
 */
export function validateOrigin(
  origin: string | undefined,
  allowedOrigins: string[],
  opts: { strict?: boolean } = {},
): OriginValidationResult {
  if (allowedOrigins.includes('*')) {
    return { allowed: true };
  }

  if (!origin) {
    // No Origin header → non-browser client.
    return opts.strict
      ? { allowed: false, reason: 'origin_required' }
      : { allowed: true };
  }

  const normalized = normalizeOrigin(origin);
  const matches = allowedOrigins.some(allowed => normalizeOrigin(allowed) === normalized);
  return matches ? { allowed: true } : { allowed: false, reason: 'origin_not_allowed' };
}

// ─────────────────────────────────────────────────────────────
// Client IP extraction (reverse-proxy aware)
// ─────────────────────────────────────────────────────────────

/**
 * Best-effort client IP. When `TRUST_PROXY=true` the left-most entry of
 * `X-Forwarded-For` is honoured (that is the original client behind an
 * ingress/load balancer); otherwise the raw socket address is used so a
 * spoofed header cannot be used to evade per-IP limits.
 */
export function extractClientIp(req: IncomingMessage): string {
  const trustProxy = process.env.TRUST_PROXY === 'true';
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (value) {
      const first = value.split(',')[0]?.trim();
      if (first) return first;
    }
  }
  return req.socket?.remoteAddress || 'unknown';
}

// ─────────────────────────────────────────────────────────────
// Authentication (API key + JWT + user-id) resolution
// ─────────────────────────────────────────────────────────────

export interface AuthenticatedClient {
  userId: string;
  tier: UserTier;
  /** How the client authenticated — surfaced in logs/metrics. */
  method: 'jwt' | 'api-key' | 'user-id' | 'anonymous';
}

/** Parse query parameters from the upgrade request URL. */
export function parseQueryParams(req: IncomingMessage): Record<string, string> {
  const params: Record<string, string> = {};
  if (!req.url) return params;
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
  } catch {
    const queryIdx = req.url.indexOf('?');
    if (queryIdx >= 0) {
      req.url.slice(queryIdx + 1).split('&').forEach(pair => {
        const [key, val] = pair.split('=');
        if (key) params[decodeURIComponent(key)] = decodeURIComponent(val || '');
      });
    }
  }
  return params;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Authenticate a WebSocket upgrade request.
 *
 * Resolution order:
 *   1. JWT bearer token (header `Authorization: Bearer` or `?token=`) — only
 *      when `WS_JWT_SECRET` is configured. A token that *looks* like a JWT but
 *      fails verification is rejected outright (no silent fallthrough).
 *   2. Static API key (`Authorization: Bearer`, `x-api-key`, or `?token=`).
 *   3. Bare user id (`x-user-id` / `?user_id=`) → anonymous-tier access.
 *   4. In development/test only, unauthenticated clients become `dev-anonymous`.
 *
 * Returns the authenticated client, or `null` if authentication failed. The
 * caller is responsible for closing the socket / rejecting the handshake.
 */
export function authenticateWebSocket(req: IncomingMessage): AuthenticatedClient | null {
  const queryParams = parseQueryParams(req);

  const authHeader = firstHeader(req.headers['authorization'] || (req.headers as any)['Authorization']);
  const xApiKey = firstHeader(req.headers['x-api-key'] || (req.headers as any)['X-API-Key']);
  const headerUserId = firstHeader(req.headers['x-user-id'] || (req.headers as any)['X-User-Id']);

  const queryToken = queryParams['token'];
  const queryUserId = queryParams['user_id'] || queryParams['userId'];

  let bearer: string | null = null;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    bearer = authHeader.slice(7);
  }
  const presentedToken = bearer || queryToken || null;
  const userId = headerUserId || queryUserId || undefined;

  // ── 1. JWT authentication ────────────────────────────────
  const jwtSecret = process.env.WS_JWT_SECRET;
  if (jwtSecret && presentedToken && presentedToken.split('.').length === 3) {
    const algorithms = (process.env.WS_JWT_ALGORITHMS || 'HS256').split(',').map(a => a.trim()).filter(Boolean);
    const result = verifyJwt(presentedToken, jwtSecret, {
      algorithms,
      issuer: process.env.WS_JWT_ISSUER || undefined,
      audience: process.env.WS_JWT_AUDIENCE || undefined,
    });
    if (!result.valid) {
      recordSecurityEvent('jwtRejected');
      logger.warn('WebSocket auth failed: invalid JWT', {
        reason: result.error,
        remoteAddress: req.socket?.remoteAddress,
      });
      return null;
    }
    recordSecurityEvent('jwtVerified');
    const payload = result.payload || {};
    const claimUserId = String(payload.sub || payload.userId || payload.uid || userId || 'jwt-user');
    const tier = resolveTier(claimUserId, payload.tier);
    return { userId: claimUserId, tier, method: 'jwt' };
  }

  // ── 2. Static API key ────────────────────────────────────
  const apiKey = process.env.API_KEY;
  const nodeEnv = process.env.NODE_ENV;
  if (apiKey) {
    if (presentedToken || xApiKey) {
      const providedKey = presentedToken || (typeof xApiKey === 'string' ? xApiKey : null);
      if (providedKey && timingSafeEqualStr(providedKey, apiKey)) {
        const resolvedUserId = userId && userId.length > 0 ? userId : 'api-user';
        return { userId: resolvedUserId, tier: resolveTier(resolvedUserId), method: 'api-key' };
      }
      // A credential was presented but did not match — reject.
      recordSecurityEvent('authFailures');
      logger.warn('WebSocket auth failed: invalid API key', { remoteAddress: req.socket?.remoteAddress });
      return null;
    }
  }

  // ── 3. Bare user id → anonymous tier ─────────────────────
  if (typeof userId === 'string' && userId.length > 0) {
    return { userId, tier: resolveTier(userId), method: 'user-id' };
  }

  // ── 4. Dev/test convenience: allow anonymous ─────────────
  if (nodeEnv === 'development' || nodeEnv === 'test') {
    return { userId: 'dev-anonymous', tier: UserTier.ANONYMOUS, method: 'anonymous' };
  }

  recordSecurityEvent('authFailures');
  logger.warn('WebSocket auth failed: no valid credentials', { remoteAddress: req.socket?.remoteAddress });
  return null;
}

function resolveTier(userId: string, claimTier?: unknown): UserTier {
  if (typeof claimTier === 'string') {
    const normalized = claimTier.toLowerCase();
    const known = Object.values(UserTier) as string[];
    if (known.includes(normalized)) {
      return normalized as UserTier;
    }
  }
  return userTierService.getUserTier(userId);
}

/** Length-safe constant-time string comparison. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ─────────────────────────────────────────────────────────────
// Connection-level rate limiting (per-IP)
// ─────────────────────────────────────────────────────────────

export interface ConnectionGuardConfig {
  /** Max concurrent open connections per IP. */
  maxConnectionsPerIp: number;
  /** Sliding window (ms) for the new-connection rate limit. */
  newConnectionWindowMs: number;
  /** Max new connections per IP within the window. */
  newConnectionMax: number;
}

export interface GuardDecision {
  allowed: boolean;
  reason?: string;
}

function defaultGuardConfig(): ConnectionGuardConfig {
  return {
    maxConnectionsPerIp: Number(process.env.WS_MAX_CONNECTIONS_PER_IP || 20),
    newConnectionWindowMs: Number(process.env.WS_NEW_CONNECTION_WINDOW_MS || 60_000),
    newConnectionMax: Number(process.env.WS_NEW_CONNECTION_MAX || 30),
  };
}

/**
 * Tracks per-IP connection counts and new-connection rate. Instantiable so
 * tests can create isolated guards; a shared singleton (`connectionGuard`) is
 * used by the live service.
 */
export class WebSocketConnectionGuard {
  private readonly config: ConnectionGuardConfig;
  private readonly active = new Map<string, number>();
  private readonly recentConnections = new Map<string, number[]>();

  constructor(cfg?: Partial<ConnectionGuardConfig>) {
    this.config = { ...defaultGuardConfig(), ...cfg };
  }

  /** Check whether a new connection from `ip` may be accepted. */
  canAccept(ip: string, now: number = Date.now()): GuardDecision {
    const activeCount = this.active.get(ip) || 0;
    if (activeCount >= this.config.maxConnectionsPerIp) {
      return { allowed: false, reason: 'too_many_connections' };
    }

    const windowStart = now - this.config.newConnectionWindowMs;
    const recent = (this.recentConnections.get(ip) || []).filter(ts => ts > windowStart);
    if (recent.length >= this.config.newConnectionMax) {
      return { allowed: false, reason: 'connection_rate_exceeded' };
    }
    return { allowed: true };
  }

  /** Record an accepted connection from `ip`. */
  register(ip: string, now: number = Date.now()): void {
    this.active.set(ip, (this.active.get(ip) || 0) + 1);
    const windowStart = now - this.config.newConnectionWindowMs;
    const recent = (this.recentConnections.get(ip) || []).filter(ts => ts > windowStart);
    recent.push(now);
    this.recentConnections.set(ip, recent);
  }

  /** Record a closed connection from `ip`. */
  release(ip: string): void {
    const activeCount = this.active.get(ip) || 0;
    if (activeCount <= 1) {
      this.active.delete(ip);
    } else {
      this.active.set(ip, activeCount - 1);
    }
  }

  activeForIp(ip: string): number {
    return this.active.get(ip) || 0;
  }

  totalActive(): number {
    let total = 0;
    this.active.forEach(count => (total += count));
    return total;
  }

  snapshot(): { uniqueIps: number; totalActive: number; maxConnectionsPerIp: number } {
    return {
      uniqueIps: this.active.size,
      totalActive: this.totalActive(),
      maxConnectionsPerIp: this.config.maxConnectionsPerIp,
    };
  }

  reset(): void {
    this.active.clear();
    this.recentConnections.clear();
  }
}

export const connectionGuard = new WebSocketConnectionGuard();

// ─────────────────────────────────────────────────────────────
// Connection timeout configuration
// ─────────────────────────────────────────────────────────────

export interface TimeoutConfig {
  /** Close a connection after this long with no inbound messages. 0 disables. */
  idleTimeoutMs: number;
  /** Hard cap on total connection lifetime. 0 disables. */
  maxLifetimeMs: number;
}

export function getTimeoutConfig(): TimeoutConfig {
  return {
    idleTimeoutMs: Number(process.env.WS_IDLE_TIMEOUT_MS || 5 * 60_000),
    maxLifetimeMs: Number(process.env.WS_MAX_CONNECTION_MS || 0),
  };
}

// ─────────────────────────────────────────────────────────────
// Security metrics (monitoring)
// ─────────────────────────────────────────────────────────────

export interface WebSocketSecurityMetrics {
  authFailures: number;
  jwtVerified: number;
  jwtRejected: number;
  originRejected: number;
  connectionRateLimited: number;
  ipConcurrencyRejected: number;
  messageRateLimited: number;
  idleTimeouts: number;
  maxLifetimeClosures: number;
  totalRejectedHandshakes: number;
}

type SecurityMetricKey = keyof WebSocketSecurityMetrics;

const metrics: WebSocketSecurityMetrics = {
  authFailures: 0,
  jwtVerified: 0,
  jwtRejected: 0,
  originRejected: 0,
  connectionRateLimited: 0,
  ipConcurrencyRejected: 0,
  messageRateLimited: 0,
  idleTimeouts: 0,
  maxLifetimeClosures: 0,
  totalRejectedHandshakes: 0,
};

/** Increment a security counter (and mirror handshake rejections into a total). */
export function recordSecurityEvent(event: SecurityMetricKey, meta?: Record<string, unknown>): void {
  metrics[event] += 1;
  if (
    event === 'originRejected' ||
    event === 'connectionRateLimited' ||
    event === 'ipConcurrencyRejected'
  ) {
    metrics.totalRejectedHandshakes += 1;
  }
  if (meta) {
    logger.debug('WebSocket security event', { event, ...meta });
  }
}

export function getSecurityMetrics(): WebSocketSecurityMetrics {
  return { ...metrics };
}

export function resetSecurityMetrics(): void {
  (Object.keys(metrics) as SecurityMetricKey[]).forEach(key => {
    metrics[key] = 0;
  });
}
