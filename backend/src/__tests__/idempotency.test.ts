import { idempotency, MemoryIdempotencyStore } from '../middleware/idempotency';
import { Request, Response } from 'express';

type FakeRes = Response & {
  captured: any;
  statusCode: number;
  jsoned: boolean;
  headers: Record<string, string>;
};

function mkRes(): FakeRes {
  const r: any = {
    statusCode: 200,
    jsoned: false,
    captured: undefined,
    headers: {},
    set(k: string, v: string) { this.headers[k.toLowerCase()] = v; return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this.captured = body; this.jsoned = true; return this; },
  };
  return r as FakeRes;
}

function mkReq(headers: Record<string, string> = {}, path = '/api/v1/payment', method = 'POST'): Request {
  return { headers, path, method, route: { path } } as unknown as Request;
}

/** Run the middleware and resolve once it either calls next() or replies. */
function run(mw: any, req: Request, res: FakeRes): Promise<{ next: boolean }> {
  return new Promise<{ next: boolean }>((resolve) => {
    let done = false;
    const finish = (nextCalled: boolean) => {
      if (!done) { done = true; resolve({ next: nextCalled }); }
    };
    // resolve on next()
    const next = () => finish(true);
    // resolve when the middleware writes a response
    const origJson = res.json.bind(res);
    res.json = ((body: any) => {
      const out = origJson(body);
      finish(false);
      return out;
    }) as Response['json'];
    mw(req, res as unknown as Response, next);
  });
}

describe('idempotency middleware', () => {
  it('passes through when no Idempotency-Key header is present', async () => {
    const store = new MemoryIdempotencyStore();
    const mw = idempotency({ store });
    const res = mkRes();
    const { next } = await run(mw, mkReq({}), res);
    expect(next).toBe(true);
    expect(res.jsoned).toBe(false);
  });

  it('first request processes; identical retry replays the cached response', async () => {
    const store = new MemoryIdempotencyStore();
    const mw = idempotency({ store, ttlSeconds: 60 });
    const key = 'abc-123';

    const res1 = mkRes();
    const r1 = await run(mw, mkReq({ 'idempotency-key': key }), res1);
    expect(r1.next).toBe(true);
    // simulate the route handler writing the response (captured by our patch)
    res1.status(200).json({ success: true, transactionId: 'tx-1' });

    const res2 = mkRes();
    const r2 = await run(mw, mkReq({ 'idempotency-key': key }), res2);
    expect(r2.next).toBe(false); // replayed from cache, handler not invoked
    expect(res2.statusCode).toBe(200);
    expect(res2.captured).toEqual({ success: true, transactionId: 'tx-1' });
    expect(res2.headers['x-idempotent-replay']).toBe('true');
  });

  it('returns 409 when a request with the same key is already in flight', async () => {
    const store = new MemoryIdempotencyStore();
    const mw = idempotency({ store, ttlSeconds: 60 });
    const key = 'inflight-key';

    const res1 = mkRes();
    await run(mw, mkReq({ 'idempotency-key': key }), res1); // acquired, "in flight"

    const res2 = mkRes();
    const r2 = await run(mw, mkReq({ 'idempotency-key': key }), res2);
    expect(r2.next).toBe(false);
    expect(res2.statusCode).toBe(409);
    expect(res2.captured.error).toBe('IDEMPOTENCY_IN_FLIGHT');
  });

  it('does not cache 5xx so the client can retry', async () => {
    const store = new MemoryIdempotencyStore();
    const mw = idempotency({ store, ttlSeconds: 60 });
    const key = 'err-key';

    const res1 = mkRes();
    await run(mw, mkReq({ 'idempotency-key': key }), res1);
    res1.status(500).json({ error: 'boom' });

    const res2 = mkRes();
    const r2 = await run(mw, mkReq({ 'idempotency-key': key }), res2);
    expect(r2.next).toBe(true); // not replayed — handler runs again
  });

  it('scopes keys per route (same client key, different route => independent)', async () => {
    const store = new MemoryIdempotencyStore();
    const mw = idempotency({ store, ttlSeconds: 60 });
    const key = 'shared-key';

    const resA = mkRes();
    await run(mw, mkReq({ 'idempotency-key': key }, '/api/v1/payment'), resA);
    resA.status(200).json({ route: 'a' });

    const resB = mkRes();
    const rB = await run(mw, mkReq({ 'idempotency-key': key }, '/api/v2/payment'), resB);
    expect(rB.next).toBe(true); // different route -> not a replay
  });
});
