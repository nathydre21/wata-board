/**
 * Integration tests for WebSocket security hardening (#368).
 *
 * Unlike websocketSecurity.test.ts (which unit-tests pure functions), this
 * suite starts the real WebSocket server on an ephemeral port and drives it
 * with a real `ws` client to prove the end-to-end handshake gates:
 *
 *   - Origin allow-listing rejects cross-site upgrades (HTTP 403)
 *   - Per-IP connection flooding is rejected at the handshake (HTTP 429)
 *   - Unverifiable JWTs are closed post-handshake (code 4001)
 *   - Valid credentials complete the handshake and receive a welcome frame
 *
 * The app modules are loaded via `jest.requireActual` so we bypass the global
 * `startWebsocketService` mock installed in src/test/setup.ts, and env is
 * configured *before* the modules load so the connection-guard singleton picks
 * up the test limits.
 */

import crypto from 'crypto';
import WebSocket from 'ws';
import type { AddressInfo } from 'net';

jest.setTimeout(20_000);

const JWT_SECRET = 'integration-test-jwt-secret';

// ── Local JWT signer (kept tiny; mirrors the server's HS256 scheme) ──
function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function signJwt(payload: Record<string, any>, secret: string): string {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64url(sig)}`;
}

// Resolved once the module graph is loaded in beforeAll.
let startWebsocketService: (port?: number) => WebSocket.Server;
let getConnectionCount: () => number;
let connectionGuard: { reset: () => void };
let resetSecurityMetrics: () => void;
let getSecurityMetrics: () => Record<string, number>;

let wss: WebSocket.Server;
let baseUrl: string;
const openSockets: WebSocket[] = [];

type ConnectOutcome =
  | { type: 'connected'; message: any; socket: WebSocket }
  | { type: 'rejected'; status?: number }
  | { type: 'closed'; code: number };

/**
 * Open a client connection and resolve with the first terminal outcome:
 * a welcome message (connected), a handshake rejection (rejected), or a
 * post-handshake close (closed). Every socket is tracked for teardown.
 */
function connect(path: string, options: Record<string, unknown> = {}): Promise<ConnectOutcome> {
  return new Promise((resolve) => {
    const socket = new WebSocket(`${baseUrl}${path}`, options as WebSocket.ClientOptions);
    openSockets.push(socket);
    let settled = false;
    const settle = (o: ConnectOutcome) => {
      if (!settled) {
        settled = true;
        resolve(o);
      }
    };

    socket.on('unexpected-response', (_req, res) => settle({ type: 'rejected', status: res.statusCode }));
    socket.on('error', () => settle({ type: 'rejected' }));
    socket.on('message', (data) => {
      let message: any;
      try {
        message = JSON.parse(data.toString());
      } catch {
        message = data.toString();
      }
      settle({ type: 'connected', message, socket });
    });
    socket.on('close', (code) => settle({ type: 'closed', code }));
  });
}

async function closeAll(): Promise<void> {
  for (const socket of openSockets) {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.terminate();
    }
  }
  openSockets.length = 0;
  // Give the server a tick to run its 'close' cleanup (guard release, etc.).
  await new Promise((r) => setTimeout(r, 50));
}

beforeAll(async () => {
  // Configure security env BEFORE the modules load: the connection-guard
  // singleton reads its limits at construction time.
  process.env.WS_ALLOWED_ORIGINS = 'http://good.example';
  process.env.WS_STRICT_ORIGIN = 'false';
  process.env.WS_JWT_SECRET = JWT_SECRET;
  process.env.WS_MAX_CONNECTIONS_PER_IP = '2';
  process.env.WS_NEW_CONNECTION_MAX = '50';

  const svc = jest.requireActual('../services/websocketService');
  startWebsocketService = svc.startWebsocketService;
  getConnectionCount = svc.getConnectionCount;

  const sec = jest.requireActual('../services/websocketSecurity');
  connectionGuard = sec.connectionGuard;
  resetSecurityMetrics = sec.resetSecurityMetrics;
  getSecurityMetrics = sec.getSecurityMetrics;

  wss = startWebsocketService(0);
  await new Promise<void>((resolve) => {
    if (wss.address()) return resolve();
    wss.on('listening', () => resolve());
  });
  const port = (wss.address() as AddressInfo).port;
  baseUrl = `ws://127.0.0.1:${port}`;
});

afterAll(async () => {
  await closeAll();
  await new Promise<void>((resolve) => wss.close(() => resolve()));
});

beforeEach(() => {
  connectionGuard.reset();
  resetSecurityMetrics();
});

afterEach(async () => {
  await closeAll();
});

describe('WebSocket security hardening (integration)', () => {
  it('accepts a native client with no Origin header in test env', async () => {
    const outcome = await connect('/');
    expect(outcome.type).toBe('connected');
    if (outcome.type === 'connected') {
      expect(outcome.message.type).toBe('connected');
      expect(outcome.message.userId).toBe('dev-anonymous');
    }
    expect(getConnectionCount()).toBe(1);
  });

  it('accepts an allow-listed Origin', async () => {
    const outcome = await connect('/', { origin: 'http://good.example' });
    expect(outcome.type).toBe('connected');
  });

  it('rejects a disallowed Origin at the handshake (403)', async () => {
    const outcome = await connect('/', { origin: 'http://evil.example' });
    expect(outcome.type).toBe('rejected');
    if (outcome.type === 'rejected') {
      expect(outcome.status).toBe(403);
    }
    expect(getSecurityMetrics().originRejected).toBeGreaterThanOrEqual(1);
  });

  it('closes a connection presenting an unverifiable JWT (code 4001)', async () => {
    const badToken = signJwt({ sub: 'attacker' }, 'the-wrong-secret');
    const outcome = await connect(`/?token=${badToken}`);
    expect(outcome.type).toBe('closed');
    if (outcome.type === 'closed') {
      expect(outcome.code).toBe(4001);
    }
    expect(getSecurityMetrics().jwtRejected).toBeGreaterThanOrEqual(1);
  });

  it('accepts a valid JWT and returns the authenticated identity', async () => {
    const token = signJwt({ sub: 'jwt-int-user', tier: 'premium' }, JWT_SECRET);
    const outcome = await connect(`/?token=${token}`);
    expect(outcome.type).toBe('connected');
    if (outcome.type === 'connected') {
      expect(outcome.message.userId).toBe('jwt-int-user');
      expect(outcome.message.tier).toBe('premium');
    }
    expect(getSecurityMetrics().jwtVerified).toBeGreaterThanOrEqual(1);
  });

  it('enforces the per-IP concurrency limit at the handshake (429)', async () => {
    // Limit is 2 (set in beforeAll). Open two sequentially so both are fully
    // registered server-side before the third handshake is evaluated.
    const first = await connect('/');
    expect(first.type).toBe('connected');
    const second = await connect('/');
    expect(second.type).toBe('connected');

    const third = await connect('/');
    expect(third.type).toBe('rejected');
    if (third.type === 'rejected') {
      expect(third.status).toBe(429);
    }
    expect(getSecurityMetrics().ipConcurrencyRejected).toBeGreaterThanOrEqual(1);
  });
});
