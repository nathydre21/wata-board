import { getTransactionStatus, updateTransactionStatus } from '../services/websocketService';

describe('WebSocket Transaction Status Store', () => {
  it('stores and retrieves transaction details correctly', () => {
    updateTransactionStatus('tx-123', 'confirming');
    expect(getTransactionStatus('tx-123')).toBe('confirming');
  });

  it('returns pending for unknown transactions', () => {
    expect(getTransactionStatus('unknown-tx')).toBe('pending');
  });
});
