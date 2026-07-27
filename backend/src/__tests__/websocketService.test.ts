import {
  getTransactionStatus,
  updateTransactionStatus,
  getWebSocketStats,
  getConnectionCount,
  TransactionStatusType,
} from '../services/websocketService';

describe('WebSocket Transaction Status Store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Transaction Status CRUD', () => {
    it('stores and retrieves transaction details correctly', async () => {
      await updateTransactionStatus('tx-123', 'confirming');
      expect(await getTransactionStatus('tx-123')).toBe('confirming');
    });

    it('returns pending for unknown transactions', async () => {
      expect(await getTransactionStatus('unknown-tx')).toBe('pending');
    });

    it('updates transaction status through all states', async () => {
      const states: TransactionStatusType[] = ['pending', 'confirming', 'confirmed'];
      for (const state of states) {
        await updateTransactionStatus('tx-multi-state', state);
        expect(await getTransactionStatus('tx-multi-state')).toBe(state);
      }
    });

    it('handles failed status correctly', async () => {
      await updateTransactionStatus('tx-failed', 'failed');
      expect(await getTransactionStatus('tx-failed')).toBe('failed');
    });

    it('stores additional transaction details', async () => {
      await updateTransactionStatus('tx-details', 'confirmed', {
        blockNumber: 123456,
        confirmations: 3,
        explorerUrl: 'https://stellar.expert/explorer/testnet/tx/tx-details',
      });

      const details = await import('../services/websocketService').then(
        (m) => m.getTransactionDetails('tx-details')
      );
      expect(details).not.toBeNull();
      expect(details?.status).toBe('confirmed');
      expect(details?.blockNumber).toBe(123456);
      expect(details?.confirmations).toBe(3);
    });
  });

  describe('WebSocket Stats', () => {
    it('returns zero connections when no clients connected', () => {
      expect(getConnectionCount()).toBe(0);
    });

    it('getWebSocketStats returns connection summary', () => {
      const stats = getWebSocketStats();
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('connections');
      expect(Array.isArray(stats.connections)).toBe(true);
      expect(stats.totalConnections).toBe(0);
    });
  });

  describe('Rate Limiting Behavior', () => {
    it('should handle concurrent status updates without errors', async () => {
      const updates = Array.from({ length: 10 }, (_, i) =>
        updateTransactionStatus(`tx-concurrent-${i}`, 'confirming')
      );
      await expect(Promise.all(updates)).resolves.not.toThrow();
    });
  });

  describe('Explorer URL generation', () => {
    it('generates testnet explorer URL by default', async () => {
      await updateTransactionStatus('tx-explorer-testnet', 'confirmed');
      const details = await import('../services/websocketService').then(
        (m) => m.getTransactionDetails('tx-explorer-testnet')
      );
      expect(details?.explorerUrl).toContain('stellar.expert/explorer/testnet/tx/');
    });
  });
});
