import { CircuitBreaker, CircuitBreakerConfig, CircuitOpenError, CircuitState } from '../../utils/circuitBreaker';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  const cfg = (o?: Partial<CircuitBreakerConfig>): CircuitBreakerConfig => ({ failureThreshold: 3, recoveryTimeMs: 5000, name: 'test', ...o });
  beforeEach(() => { cb = new CircuitBreaker(cfg()); jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  const openCb = async () => { for (let i = 0; i < 3; i++) await cb.execute(() => Promise.reject(new Error('e'))).catch(() => {}); };

  it('starts CLOSED', () => { expect(cb.getState()).toBe(CircuitState.CLOSED); });
  it('has zero failures initially', () => { expect(cb.getFailureCount()).toBe(0); });
  it('executes and returns result', async () => { expect(await cb.execute(() => Promise.resolve('ok'))).toBe('ok'); });
  it('stays CLOSED after success', async () => { await cb.execute(() => Promise.resolve(1)); expect(cb.getState()).toBe(CircuitState.CLOSED); });
  it('resets failure count after success', async () => {
    for (let i = 0; i < 2; i++) await cb.execute(() => Promise.reject(new Error('e'))).catch(() => {});
    expect(cb.getFailureCount()).toBe(2);
    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getFailureCount()).toBe(0);
  });
  it('increments failure count', async () => {
    await cb.execute(() => Promise.reject(new Error('e1'))).catch(() => {});
    expect(cb.getFailureCount()).toBe(1);
    await cb.execute(() => Promise.reject(new Error('e2'))).catch(() => {});
    expect(cb.getFailureCount()).toBe(2);
  });
  it('stays CLOSED below threshold', async () => {
    for (let i = 0; i < 2; i++) await cb.execute(() => Promise.reject(new Error('e'))).catch(() => {});
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });
  it('opens when failures reach threshold', async () => { await openCb(); expect(cb.getState()).toBe(CircuitState.OPEN); });
  it('throws CircuitOpenError when OPEN', async () => {
    await openCb();
    await expect(cb.execute(() => Promise.resolve('x'))).rejects.toThrow(CircuitOpenError);
  });
  it('does not call fn when OPEN', async () => {
    await openCb();
    const fn = jest.fn().mockResolvedValue('v'); await cb.execute(fn).catch(() => {});
    expect(fn).not.toHaveBeenCalled();
  });
  it('CircuitOpenError carries circuit name', async () => {
    await openCb();
    try { await cb.execute(() => Promise.resolve('x')); } catch(e) {
      expect(e).toBeInstanceOf(CircuitOpenError);
      expect((e as CircuitOpenError).circuitName).toBe('test');
    }
  });
  it('transitions to HALF_OPEN after recovery time', async () => {
    await openCb(); jest.advanceTimersByTime(5001);
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
  });
  it('closes circuit when probe succeeds', async () => {
    await openCb(); jest.advanceTimersByTime(5001);
    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getState()).toBe(CircuitState.CLOSED); expect(cb.getFailureCount()).toBe(0);
  });
  it('re-opens when probe fails', async () => {
    await openCb(); jest.advanceTimersByTime(5001);
    await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    expect(cb.getState()).toBe(CircuitState.OPEN);
  });
  it('manual reset restores CLOSED state', async () => {
    await openCb(); cb.reset();
    expect(cb.getState()).toBe(CircuitState.CLOSED); expect(cb.getFailureCount()).toBe(0);
  });
  it('allows calls after reset', async () => {
    await openCb(); cb.reset();
    expect(await cb.execute(() => Promise.resolve('after'))).toBe('after');
  });
  it('respects custom failure threshold', async () => {
    const cb2 = new CircuitBreaker(cfg({ failureThreshold: 1 }));
    await cb2.execute(() => Promise.reject(new Error('e'))).catch(() => {});
    expect(cb2.getState()).toBe(CircuitState.OPEN);
  });
  it('respects custom recovery time', async () => {
    const cb2 = new CircuitBreaker(cfg({ failureThreshold: 1, recoveryTimeMs: 10000 }));
    await cb2.execute(() => Promise.reject(new Error('e'))).catch(() => {});
    jest.advanceTimersByTime(9999); expect(cb2.getState()).toBe(CircuitState.OPEN);
    jest.advanceTimersByTime(1); expect(cb2.getState()).toBe(CircuitState.HALF_OPEN);
  });
  it('re-throws original error', async () => {
    const e = new Error('specific'); await expect(cb.execute(() => Promise.reject(e))).rejects.toThrow('specific');
  });
});
