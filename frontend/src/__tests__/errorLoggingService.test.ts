import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logClientError } from '../services/errorLoggingService';

describe('ErrorLoggingService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a client-side error report', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    (globalThis as any).fetch = fetchMock;

    await logClientError(new Error('Test error'), 'test stack', { page: 'home' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.stringContaining('Test error')
    });
  });
});
