import { useEffect } from 'react';
import { offlineQueueService } from '../services/offlineQueueService';
import { subscribeToNetworkChanges } from '../utils/networkStatus';

export const useOfflineSync = () => {
  useEffect(() => {
    const maxAttemptsPerItem = 5;

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const isRetryableStatus = (status: number): boolean => {
      return status === 429 || status >= 500;
    };

    const withExponentialBackoff = async (operation: () => Promise<Response>, retryCount: number) => {
      const response = await operation();
      if (!response.ok && isRetryableStatus(response.status) && retryCount < maxAttemptsPerItem) {
        const backoffMs = Math.min(1000 * (2 ** retryCount), 10000);
        await delay(backoffMs);
        throw new Error(`Retryable sync failure (${response.status})`);
      }
      return response;
    };

    const syncQueue = async () => {
      const queue = await offlineQueueService.getQueue();
      if (queue.length === 0) return;

      let processedHashes = new Set<string>();
      try {
        // Conflict resolution: fetch history when endpoint is available.
        const historyResponse = await fetch('/api/payment/history');
        if (historyResponse.ok) {
          const historyPayload = await historyResponse.json();
          const historyRecords = historyPayload?.data?.records ?? historyPayload ?? [];
          processedHashes = new Set((historyRecords ?? []).map((p: any) => p.offlineId).filter(Boolean));
        }
      } catch {
        // Best-effort only; sync continues even when history endpoint is unavailable.
      }

      for (const item of queue) {
        if (processedHashes.has(item.id)) {
          await offlineQueueService.dequeue(item.id);
          continue;
        }

        try {
          const response = await withExponentialBackoff(
            () =>
              fetch('/api/payment', {
                method: 'POST',
                body: JSON.stringify({ ...item.payload, offlineId: item.id }),
                headers: { 'Content-Type': 'application/json' }
              }),
            item.retryCount
          );

          if (response.ok) {
            await offlineQueueService.dequeue(item.id);
          } else if (!isRetryableStatus(response.status)) {
            // Avoid infinite retries for validation/auth style failures.
            await offlineQueueService.dequeue(item.id);
          } else {
            await offlineQueueService.updateRetryMetadata(
              item.id,
              item.retryCount + 1,
              `HTTP ${response.status}`
            );
          }
        } catch (err) {
          await offlineQueueService.updateRetryMetadata(
            item.id,
            item.retryCount + 1,
            err instanceof Error ? err.message : 'Unknown sync error'
          );
          console.error('Sync failed for item', item.id);
        }
      }
    };

    if (navigator.onLine) {
      void syncQueue();
    }

    return subscribeToNetworkChanges((online: boolean) => {
      if (online) syncQueue();
    });
  }, []);
};