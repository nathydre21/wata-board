import {
  KycOrchestrationService,
  KycState,
  KycTier,
  TIER_MATRIX,
  KycEnforcementError,
} from '../services/kycOrchestrationService';
import {
  SanctionsScreeningAdapter,
  ScreeningResult,
  ScreeningInput,
  ScreeningResultCache,
  CachedScreeningAdapter,
} from '../services/sanctionsScreening';

class FakeAdapter implements SanctionsScreeningAdapter {
  readonly name = 'fake';
  calls = 0;
  constructor(private behaviour: (i: ScreeningInput) => ScreeningResult | Error) {}
  async screen(input: ScreeningInput): Promise<ScreeningResult> {
    this.calls++;
    const out = this.behaviour(input);
    if (out instanceof Error) throw out;
    return out;
  }
}

const clear = (i: ScreeningInput): ScreeningResult => ({
  userId: i.userId, risk: 'clear', matchScore: 0, reason: 'ok', screenedAt: Date.now(), provider: 'fake', fromCache: false,
});

describe('KYC orchestration state machine', () => {
  it('starts at Initiated tier 0 and blocks payments', () => {
    const svc = new KycOrchestrationService(new FakeAdapter(clear));
    expect(svc.getTier('u1')).toBe(0);
    expect(() => svc.assertCanPay('u1', 10)).toThrow(KycEnforcementError);
  });

  it('walks Initiated -> DocumentsSubmitted -> Screening -> Approved for a clear user', async () => {
    const svc = new KycOrchestrationService(new FakeAdapter(clear));
    svc.submitDocuments('u1');
    const rec = await svc.runScreening({ userId: 'u1', fullName: 'Jane Doe' });
    expect(rec.state).toBe(KycState.Approved);
    expect(rec.tier).toBe(1);
    // tier 1 allows small payments, blocks large ones
    svc.assertCanPay('u1', 400);
    expect(() => svc.assertCanPay('u1', 600)).toThrow(KycEnforcementError);
  });

  it('routes a sanctions match to Review (manual review)', async () => {
    const svc = new KycOrchestrationService(new FakeAdapter((i) => ({
      userId: i.userId, risk: 'rejected', matchScore: 95, reason: 'hit', screenedAt: Date.now(), provider: 'fake', fromCache: false,
    })));
    svc.submitDocuments('u1');
    const rec = await svc.runScreening({ userId: 'u1', fullName: 'Bad Actor' });
    expect(rec.state).toBe(KycState.Review);
    // reviewer approves -> Approved, tier 1
    svc.reviewerDecision('u1', true, 'false positive');
    expect(svc.getRecord('u1')!.state).toBe(KycState.Approved);
  });

  it('rejects illegal transitions', () => {
    const svc = new KycOrchestrationService(new FakeAdapter(clear));
    expect(() => svc.transition('u1', KycState.Approved)).toThrow(/Illegal KYC transition/);
  });

  it('idempotent transitions are no-ops', () => {
    const svc = new KycOrchestrationService(new FakeAdapter(clear));
    svc.submitDocuments('u1');
    const before = svc.getRecord('u1')!.history.length;
    svc.submitDocuments('u1'); // no-op
    svc.submitDocuments('u1'); // no-op
    expect(svc.getRecord('u1')!.history.length).toBe(before);
  });
});

describe('KYC screening retry + safe degradation', () => {
  it('retries with backoff then succeeds', async () => {
    let attempts = 0;
    const svc = new KycOrchestrationService(
      new FakeAdapter((i) => {
        attempts++;
        if (attempts < 3) throw new Error('transient');
        return clear(i);
      }),
      { maxAttempts: 4, baseDelayMs: 1, maxDelayMs: 2 },
    );
    svc.submitDocuments('u1');
    const rec = await svc.runScreening({ userId: 'u1', fullName: 'x' });
    expect(rec.state).toBe(KycState.Approved);
    expect(attempts).toBe(3);
  });

  it('degrades to Review when the provider stays unavailable', async () => {
    const svc = new KycOrchestrationService(
      new FakeAdapter(() => { throw new Error('down'); }),
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
    );
    svc.submitDocuments('u1');
    const rec = await svc.runScreening({ userId: 'u1', fullName: 'x' });
    expect(rec.state).toBe(KycState.Review);
  });
});

describe('KYC tier matrix enforcement', () => {
  it('enforces refund limits per tier', () => {
    const svc = new KycOrchestrationService(new FakeAdapter(clear));
    svc.submitDocuments('u1');
    // bump to tier 2
    return svc.runScreening({ userId: 'u1', fullName: 'ok' }).then(() => {
      svc.setTier('u1', 2 as KycTier);
      svc.assertCanRefund('u1', 4000);
      expect(() => svc.assertCanRefund('u1', 6000)).toThrow(KycEnforcementError);
    });
  });

  it('tier 3 allows large payments', () => {
    const svc = new KycOrchestrationService(new FakeAdapter(clear));
    svc.submitDocuments('u1');
    return svc.runScreening({ userId: 'u1', fullName: 'ok' }).then(() => {
      svc.setTier('u1', 3 as KycTier);
      svc.assertCanPay('u1', 1_000_000);
    });
  });
});

describe('Screening result cache', () => {
  it('serves cached results and supports invalidation', async () => {
    const cache = new ScreeningResultCache(10);
    const inner = new FakeAdapter(clear);
    const cached = new CachedScreeningAdapter(inner, cache);
    await cached.screen({ userId: 'u1', fullName: 'a' });
    await cached.screen({ userId: 'u1', fullName: 'a' });
    expect(inner.calls).toBe(1); // second served from cache
    cache.invalidate('u1');
    await cached.screen({ userId: 'u1', fullName: 'a' });
    expect(inner.calls).toBe(2);
  });

  it('expired entries are re-screened', async () => {
    jest.useFakeTimers({ now: 1000 });
    try {
      const cache = new ScreeningResultCache(10);
      const inner = new FakeAdapter(clear);
      const cached = new CachedScreeningAdapter(inner, cache);
      await cached.screen({ userId: 'u1', fullName: 'a' }); // cached until t=1010
      jest.setSystemTime(2000); // beyond TTL -> entry expired
      await cached.screen({ userId: 'u1', fullName: 'a' });
      expect(inner.calls).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('TIER_MATRIX shape', () => {
  it('tier 0 blocks everything; tier 3 is unlimited', () => {
    expect(TIER_MATRIX[0].maxPaymentAmount).toBe(0);
    expect(TIER_MATRIX[3].maxPaymentAmount).toBe(Number.MAX_SAFE_INTEGER);
    expect(TIER_MATRIX[0].canWithdraw).toBe(false);
    expect(TIER_MATRIX[3].canOperateProviders).toBe(true);
  });
});
