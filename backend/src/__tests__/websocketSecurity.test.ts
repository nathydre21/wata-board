/**
 * Unit tests for WebSocket security primitives (#368).
 *
 * These exercise the pure security logic — JWT verification, origin
 * allow-listing, per-IP connection limiting, IP extraction and metrics —
 * without opening real sockets.
 */

import crypto from 'crypto';
import { IncomingMessage } from 'http';
import {
  verifyJwt,
  validateOrigin,
  normalizeOrigin,
  getAllowedOrigins,
  extractClientIp,
  authenticateWebSocket,
  WebSocketConnectionGuard,
  recordSecurityEvent,
  getSecurityMetrics,
  resetSecurityMetrics,
} from '../services/websocketSecurity';
import { UserTier } from '../types/userTier';

// ── Helpers ──────────────────────────────────────────────────

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function signJwt(
  payload: Record<string, any>,
  secret: string,
  header: Record<string, any> = { alg: 'HS256', typ: 'JWT' },
): string {
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const algo =
    header.alg === 'HS512' ? 'sha512' : header.alg === 'HS384' ? 'sha384' : 'sha256';
  const sig = crypto.createHmac(algo, secret).update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64url(sig)}`;
}

/** Minimal IncomingMessage stand-in for auth/IP tests. */
function fakeReq(opts: {
  url?: string;
  headers?: Record<string, string>;
  remoteAddress?: string;
}): IncomingMessage {
  return {
    url: opts.url ?? '/',
    headers: opts.headers ?? {},
    socket: { remoteAddress: opts.remoteAddress ?? '127.0.0.1' },
  } as unknown as IncomingMessage;
}

const SECRET = 'super-secret-key-for-tests';

describe('verifyJwt', () => {
  it('accepts a valid HS256 token and returns the payload', () => {
    const token = signJwt({ sub: 'user-1', tier: 'premium' }, SECRET);
    const result = verifyJwt(token, SECRET);
    expect(result.valid).toBe(true);
    expect(result.payload?.sub).toBe('user-1');
    expect(result.payload?.tier).toBe('premium');
  });

  it('rejects a token signed with a different secret', () => {
    const token = signJwt({ sub: 'user-1' }, 'a-different-secret');
    const result = verifyJwt(token, SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid_signature');
  });

  it('rejects a tampered payload', () => {
    const token = signJwt({ sub: 'user-1', tier: 'anonymous' }, SECRET);
    const [h, , s] = token.split('.');
    const forgedPayload = b64url(JSON.stringify({ sub: 'user-1', tier: 'admin' }));
    const forged = `${h}.${forgedPayload}.${s}`;
    expect(verifyJwt(forged, SECRET).valid).toBe(false);
  });

  it('rejects the "none" algorithm (downgrade attack)', () => {
    const h = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const p = b64url(JSON.stringify({ sub: 'attacker' }));
    const token = `${h}.${p}.`;
    const result = verifyJwt(token, SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('alg_none_forbidden');
  });

  it('rejects an algorithm that is not in the allow-list', () => {
    const token = signJwt({ sub: 'user-1' }, SECRET, { alg: 'HS512', typ: 'JWT' });
    const result = verifyJwt(token, SECRET, { algorithms: ['HS256'] });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('alg_not_allowed:HS512');
  });

  it('accepts HS512 when explicitly allowed', () => {
    const token = signJwt({ sub: 'user-1' }, SECRET, { alg: 'HS512', typ: 'JWT' });
    expect(verifyJwt(token, SECRET, { algorithms: ['HS512'] }).valid).toBe(true);
  });

  it('rejects an expired token', () => {
    const token = signJwt({ sub: 'user-1', exp: 1_000 }, SECRET);
    const result = verifyJwt(token, SECRET, { now: 2_000 });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('token_expired');
  });

  it('honours clock tolerance around exp', () => {
    const token = signJwt({ sub: 'user-1', exp: 1_000 }, SECRET);
    expect(verifyJwt(token, SECRET, { now: 1_003, clockToleranceSec: 5 }).valid).toBe(true);
  });

  it('rejects a token that is not yet valid (nbf)', () => {
    const token = signJwt({ sub: 'user-1', nbf: 5_000 }, SECRET);
    const result = verifyJwt(token, SECRET, { now: 1_000 });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('token_not_active');
  });

  it('validates issuer and audience when configured', () => {
    const token = signJwt({ sub: 'u', iss: 'wata', aud: ['app'] }, SECRET);
    expect(verifyJwt(token, SECRET, { issuer: 'wata', audience: 'app' }).valid).toBe(true);
    expect(verifyJwt(token, SECRET, { issuer: 'other' }).error).toBe('invalid_issuer');
    expect(verifyJwt(token, SECRET, { audience: 'nope' }).error).toBe('invalid_audience');
  });

  it('rejects malformed tokens and empty input without throwing', () => {
    expect(verifyJwt('', SECRET).error).toBe('missing_token');
    expect(verifyJwt('a.b', SECRET).error).toBe('malformed_token');
    expect(verifyJwt('not-a-jwt', SECRET).error).toBe('malformed_token');
    expect(verifyJwt('...', SECRET).valid).toBe(false);
  });

  it('rejects when no secret is configured', () => {
    const token = signJwt({ sub: 'u' }, SECRET);
    expect(verifyJwt(token, '').error).toBe('no_secret_configured');
  });
});

describe('validateOrigin', () => {
  const allow = ['http://localhost:3000', 'https://app.wata.example'];

  it('allows an exact allow-listed origin', () => {
    expect(validateOrigin('http://localhost:3000', allow).allowed).toBe(true);
  });

  it('normalises case and trailing slashes', () => {
    expect(validateOrigin('HTTP://LOCALHOST:3000/', allow).allowed).toBe(true);
    expect(normalizeOrigin('HTTP://Example.com/')).toBe('http://example.com');
  });

  it('rejects an origin that is not allow-listed', () => {
    const result = validateOrigin('http://evil.example', allow);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('origin_not_allowed');
  });

  it('allows a missing origin (non-browser client) by default', () => {
    expect(validateOrigin(undefined, allow).allowed).toBe(true);
  });

  it('rejects a missing origin in strict mode', () => {
    const result = validateOrigin(undefined, allow, { strict: true });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('origin_required');
  });

  it('treats a "*" entry as allow-all', () => {
    expect(validateOrigin('http://anything.example', ['*']).allowed).toBe(true);
  });
});

describe('getAllowedOrigins', () => {
  const original = process.env.WS_ALLOWED_ORIGINS;
  afterEach(() => {
    if (original === undefined) delete process.env.WS_ALLOWED_ORIGINS;
    else process.env.WS_ALLOWED_ORIGINS = original;
  });

  it('parses the comma-separated WS_ALLOWED_ORIGINS override', () => {
    process.env.WS_ALLOWED_ORIGINS = 'http://a.com, http://b.com ,';
    expect(getAllowedOrigins()).toEqual(['http://a.com', 'http://b.com']);
  });

  it('falls back to the CORS allow-list when unset', () => {
    delete process.env.WS_ALLOWED_ORIGINS;
    expect(Array.isArray(getAllowedOrigins())).toBe(true);
  });
});

describe('extractClientIp', () => {
  const original = process.env.TRUST_PROXY;
  afterEach(() => {
    if (original === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = original;
  });

  it('uses the socket address when proxies are not trusted', () => {
    delete process.env.TRUST_PROXY;
    const req = fakeReq({ headers: { 'x-forwarded-for': '9.9.9.9' }, remoteAddress: '10.0.0.1' });
    expect(extractClientIp(req)).toBe('10.0.0.1');
  });

  it('honours the left-most X-Forwarded-For entry when TRUST_PROXY=true', () => {
    process.env.TRUST_PROXY = 'true';
    const req = fakeReq({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, remoteAddress: '10.0.0.1' });
    expect(extractClientIp(req)).toBe('1.2.3.4');
  });
});

describe('WebSocketConnectionGuard', () => {
  it('allows connections below the per-IP concurrency limit', () => {
    const guard = new WebSocketConnectionGuard({ maxConnectionsPerIp: 2, newConnectionMax: 100 });
    expect(guard.canAccept('1.1.1.1').allowed).toBe(true);
    guard.register('1.1.1.1');
    expect(guard.canAccept('1.1.1.1').allowed).toBe(true);
    guard.register('1.1.1.1');
    const decision = guard.canAccept('1.1.1.1');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('too_many_connections');
  });

  it('releases slots so a freed connection can reconnect', () => {
    const guard = new WebSocketConnectionGuard({ maxConnectionsPerIp: 1, newConnectionMax: 100 });
    guard.register('2.2.2.2');
    expect(guard.canAccept('2.2.2.2').allowed).toBe(false);
    guard.release('2.2.2.2');
    expect(guard.canAccept('2.2.2.2').allowed).toBe(true);
    expect(guard.activeForIp('2.2.2.2')).toBe(0);
  });

  it('enforces the new-connection rate within the window', () => {
    const guard = new WebSocketConnectionGuard({
      maxConnectionsPerIp: 100,
      newConnectionMax: 3,
      newConnectionWindowMs: 60_000,
    });
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(guard.canAccept('3.3.3.3', now).allowed).toBe(true);
      guard.register('3.3.3.3', now);
      guard.release('3.3.3.3'); // close immediately — rate limit is independent of concurrency
    }
    const decision = guard.canAccept('3.3.3.3', now);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('connection_rate_exceeded');
  });

  it('does not count connections from other IPs', () => {
    const guard = new WebSocketConnectionGuard({ maxConnectionsPerIp: 1, newConnectionMax: 100 });
    guard.register('4.4.4.4');
    expect(guard.canAccept('5.5.5.5').allowed).toBe(true);
  });

  it('reports a snapshot and resets cleanly', () => {
    const guard = new WebSocketConnectionGuard({ maxConnectionsPerIp: 10, newConnectionMax: 100 });
    guard.register('6.6.6.6');
    guard.register('7.7.7.7');
    expect(guard.snapshot().totalActive).toBe(2);
    expect(guard.snapshot().uniqueIps).toBe(2);
    guard.reset();
    expect(guard.snapshot().totalActive).toBe(0);
  });
});

describe('authenticateWebSocket', () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    API_KEY: process.env.API_KEY,
    WS_JWT_SECRET: process.env.WS_JWT_SECRET,
  };
  afterEach(() => {
    process.env.NODE_ENV = saved.NODE_ENV;
    process.env.API_KEY = saved.API_KEY;
    if (saved.WS_JWT_SECRET === undefined) delete process.env.WS_JWT_SECRET;
    else process.env.WS_JWT_SECRET = saved.WS_JWT_SECRET;
  });

  it('authenticates a valid JWT via the token query param', () => {
    process.env.WS_JWT_SECRET = SECRET;
    const token = signJwt({ sub: 'jwt-user-1', tier: 'premium' }, SECRET);
    const auth = authenticateWebSocket(fakeReq({ url: `/?token=${token}` }));
    expect(auth).not.toBeNull();
    expect(auth?.userId).toBe('jwt-user-1');
    expect(auth?.tier).toBe(UserTier.PREMIUM);
    expect(auth?.method).toBe('jwt');
  });

  it('rejects an invalid JWT even in test env (no silent fallthrough)', () => {
    process.env.WS_JWT_SECRET = SECRET;
    const badToken = signJwt({ sub: 'x' }, 'wrong-secret');
    const auth = authenticateWebSocket(fakeReq({ url: `/?token=${badToken}` }));
    expect(auth).toBeNull();
  });

  it('authenticates a matching static API key', () => {
    process.env.NODE_ENV = 'production';
    process.env.API_KEY = 'the-api-key';
    delete process.env.WS_JWT_SECRET;
    const auth = authenticateWebSocket(
      fakeReq({ headers: { authorization: 'Bearer the-api-key', 'x-user-id': 'u-9' } }),
    );
    expect(auth?.userId).toBe('u-9');
    expect(auth?.method).toBe('api-key');
  });

  it('rejects a wrong API key in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.API_KEY = 'the-api-key';
    delete process.env.WS_JWT_SECRET;
    const auth = authenticateWebSocket(fakeReq({ headers: { 'x-api-key': 'nope' } }));
    expect(auth).toBeNull();
  });

  it('allows a bare user id at anonymous tier', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.WS_JWT_SECRET;
    const auth = authenticateWebSocket(fakeReq({ url: '/?user_id=guest-1' }));
    expect(auth?.userId).toBe('guest-1');
    expect(auth?.method).toBe('user-id');
  });

  it('rejects a fully anonymous connection in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.WS_JWT_SECRET;
    expect(authenticateWebSocket(fakeReq({}))).toBeNull();
  });

  it('allows a fully anonymous connection in test/development', () => {
    process.env.NODE_ENV = 'test';
    const auth = authenticateWebSocket(fakeReq({}));
    expect(auth?.method).toBe('anonymous');
  });
});

describe('security metrics', () => {
  beforeEach(() => resetSecurityMetrics());

  it('increments counters and rolls up handshake rejections', () => {
    recordSecurityEvent('originRejected');
    recordSecurityEvent('connectionRateLimited');
    recordSecurityEvent('jwtRejected');
    const m = getSecurityMetrics();
    expect(m.originRejected).toBe(1);
    expect(m.connectionRateLimited).toBe(1);
    expect(m.jwtRejected).toBe(1);
    // originRejected + connectionRateLimited roll into the handshake total; jwtRejected does not.
    expect(m.totalRejectedHandshakes).toBe(2);
  });

  it('resets all counters', () => {
    recordSecurityEvent('authFailures');
    resetSecurityMetrics();
    expect(getSecurityMetrics().authFailures).toBe(0);
  });
});
