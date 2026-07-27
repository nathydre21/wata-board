import {
  routeProviders,
  processBulkPayment,
  ProviderRouteInfo,
  ProviderHealth,
  PaymentLeg,
  RouterDeps,
  SagaEvent,
} from '../services/providerRouter';

const providers: ProviderRouteInfo[] = [
  { id: 'A', name: 'A', active: true, successRate: 0.95 },
  { id: 'B', name: 'B', active: true, successRate: 0.6 },
  { id: 'C', name: 'C', active: true, successRate: 0.3 },
];

const allHealthy: ProviderHealth = { isAvailable: () => true };

describe('routeProviders', () => {
  it('round-robin rotates and repeats deterministically', () => {
    const cursor = { i: 0 };
    const order1 = routeProviders(providers, 'round-robin', allHealthy, cursor).map((p) => p.id);
    const order2 = routeProviders(providers, 'round-robin', allHealthy, cursor).map((p) => p.id);
    expect(order1).toEqual(['A', 'B', 'C']);
    expect(order2).toEqual(['B', 'C', 'A']); // rotated
  });

  it('weighted orders by success rate (best first)', () => {
    const order = routeProviders(providers, 'weighted', allHealthy).map((p) => p.id);
    expect(order).toEqual(['A', 'B', 'C']);
  });

  it('health-gated prefers >=0.8 but falls back if none qualify', () => {
    const order = routeProviders(providers, 'health-gated', allHealthy).map((p) => p.id);
    expect(order).toEqual(['A']); // only A >= 0.8
    const low = providers.map((p) => ({ ...p, successRate: p.successRate * 0.5 }));
    const fallback = routeProviders(low, 'health-gated', allHealthy).map((p) => p.id);
    expect(fallback).toEqual(['A', 'B', 'C']); // none >=0.8 -> fallback sorted
  });

  it('excludes providers whose breaker is open (health gate false)', () => {
    const health: ProviderHealth = { isAvailable: (id) => id !== 'A' };
    const order = routeProviders(providers, 'weighted', health).map((p) => p.id);
    expect(order).toEqual(['B', 'C']); // A excluded
  });
});

function makeDeps(
  submitMap: Record<string, ((leg: PaymentLeg) => Promise<string>) | string | Error>,
  horizonSealed: Set<string>,
  overrides: Partial<RouterDeps> = {},
): { deps: RouterDeps; compensate: jest.Mock; events: SagaEvent[] } {
  const compensate = jest.fn().mockResolvedValue(undefined);
  const events: SagaEvent[] = [];
  const deps: RouterDeps = {
    submit: async (leg) => {
      const v = submitMap[leg.providerId];
      if (v instanceof Error) throw v;
      if (typeof v === 'function') return await (v as (l: PaymentLeg) => Promise<string>)(leg);
      return v as string;
    },
    compensate,
    horizon: { isFinalized: async (h) => ({ sealed: horizonSealed.has(h), ledger: horizonSealed.has(h) ? 123 : undefined }) },
    health: allHealthy,
    finalityTimeoutMs: 10,
    finalityPollMs: 1,
    sleep: async () => { /* instant */ },
    ...overrides,
  };
  return { deps, compensate, events };
}

describe('processBulkPayment saga', () => {
  it('settles when all legs succeed and are sealed', async () => {
    const { deps, events } = makeDeps({ A: 'hA', B: 'hB' }, new Set(['hA', 'hB']));
    const res = await processBulkPayment(
      [{ providerId: 'A', meterId: 'm1', amount: 100 }, { providerId: 'B', meterId: 'm2', amount: 50 }],
      deps,
      [(e) => events.push(e)],
    );
    expect(res.settled).toBe(true);
    expect(res.finalizationStatus).toBe('confirmed');
    expect(res.legs.map((l) => l.status)).toEqual(['confirmed', 'confirmed']);
    expect(deps.compensate).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === 'BulkPaymentSettled')).toBe(true);
  });

  it('on a leg failure, compensates already-succeeded legs and aborts', async () => {
    const { deps, compensate, events } = makeDeps({ A: 'hA', B: new Error('provider B reverted') }, new Set());
    const res = await processBulkPayment(
      [{ providerId: 'A', meterId: 'm1', amount: 100 }, { providerId: 'B', meterId: 'm2', amount: 50 }],
      deps,
      [(e) => events.push(e)],
    );
    expect(res.settled).toBe(false);
    expect(res.compensated).toBe(true);
    expect(res.finalizationStatus).toBe('failed');
    // A submitted then compensated; B failed
    const statuses = res.legs.map((l) => l.status);
    expect(statuses).toContain('compensated');
    expect(statuses).toContain('failed');
    expect(compensate).toHaveBeenCalledWith('hA');
    expect(events.some((e) => e.type === 'BulkPaymentCompensated')).toBe(true);
  });

  it('does not mark confirmed when the ledger is not yet sealed (pending)', async () => {
    const { deps } = makeDeps({ A: 'hA' }, new Set()); // nothing sealed
    const res = await processBulkPayment([{ providerId: 'A', meterId: 'm1', amount: 100 }], deps);
    expect(res.settled).toBe(false);
    expect(res.finalizationStatus).toBe('pending');
    expect(res.legs[0].status).toBe('not_sealed');
  });

  it('breaker-open providers are excluded by routing before submission', async () => {
    const { deps } = makeDeps({ A: 'hA', B: 'hB' }, new Set(['hA', 'hB']));
    // route with health that excludes A; choose B instead
    const order = routeProviders(providers, 'weighted', { isAvailable: (id) => id !== 'A' });
    expect(order[0].id).toBe('B');
    // submit to the routed provider (B), which succeeds+seals
    const res = await processBulkPayment([{ providerId: order[0].id, meterId: 'm', amount: 1 }], deps);
    expect(res.settled).toBe(true);
  });

  it('compensation failure leaves the leg pending (needs manual reconciliation)', async () => {
    const { deps, compensate } = makeDeps({ A: 'hA', B: new Error('boom') }, new Set());
    compensate.mockRejectedValueOnce(new Error('refund failed'));
    const res = await processBulkPayment(
      [{ providerId: 'A', meterId: 'm1', amount: 100 }, { providerId: 'B', meterId: 'm2', amount: 50 }],
      deps,
    );
    expect(res.compensated).toBe(false); // compensation failed
    expect(res.legs.find((l) => l.providerId === 'A')!.status).toBe('pending');
  });
});
