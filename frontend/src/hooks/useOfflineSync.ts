import { useEffect } from 'react';
import { offlineQueueService } from '../services/offlineQueueService';
import { subscribeToNetworkChanges } from '../utils/networkStatus';

export const useOfflineSync = () => {
  useEffect(() => {
    const syncQueue = async () => {
      const queue = await offlineQueueService.getQueue();
      if (queue.length === 0) return;

      // Conflict resolution: Fetch history to ensure transactions aren't duplicates
      const historyResponse = await fetch('/api/payment/history');
      const history = await historyResponse.json();
      const processedHashes = new Set(history.map((p: any) => p.offlineId));

      for (const item of queue) {
        if (processedHashes.has(item.id)) {
          await offlineQueueService.dequeue(item.id);
          continue;
        }

        try {
          const response = await fetch('/api/payment', {
            method: 'POST',
            body: JSON.stringify({ ...item.payload, offlineId: item.id }),
            headers: { 'Content-Type': 'application/json' }
          });
          if (response.ok) {
            await offlineQueueService.dequeue(item.id);
          }
        } catch (err) {
          console.error('Sync failed for item', item.id);
        }
      }
    };

    return subscribeToNetworkChanges((online) => {
      if (online) syncQueue();
    });
  }, []);
};