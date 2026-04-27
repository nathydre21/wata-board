import { getTransactionStatus, updateTransactionStatus } from '../services/websocketService';

describe('WebSocket Transaction Status Store', () => {
  it('stores and retrieves transaction details correctly', async () => {
    await updateTransactionStatus('tx-123', 'confirming');
    expect(await getTransactionStatus('tx-123')).toBe('confirming');
  });

  it('returns pending for unknown transactions', async () => {
    expect(await getTransactionStatus('unknown-tx')).toBe('pending');
  });
});
