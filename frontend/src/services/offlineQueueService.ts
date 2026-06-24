export interface QueuedTransaction {
  id: string;
  payload: any;
  timestamp: number;
  retryCount: number;
  lastError?: string;
}

class OfflineQueueService {
  private dbName = 'wata_board_offline';
  private storeName = 'payment_queue';

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async runTransaction<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error: Error) => void) => void
  ): Promise<T> {
    const db = await this.openDB();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, mode);
      const store = transaction.objectStore(this.storeName);
      operation(store, resolve, reject);
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    });
  }

  async getQueue(): Promise<QueuedTransaction[]> {
    return this.runTransaction<QueuedTransaction[]>('readonly', (store, resolve) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const queue = (request.result ?? []) as QueuedTransaction[];
        queue.sort((a, b) => a.timestamp - b.timestamp);
        resolve(queue);
      };
    });
  }

  async enqueue(payload: any): Promise<string> {
    const id = crypto.randomUUID();
    await this.runTransaction<void>('readwrite', (store, resolve) => {
      store.add({
        id,
        payload,
        timestamp: Date.now(),
        retryCount: 0
      } satisfies QueuedTransaction);
      resolve();
    });
    return id;
  }

  async updateRetryMetadata(id: string, retryCount: number, lastError?: string): Promise<void> {
    await this.runTransaction<void>('readwrite', (store, resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const existing = request.result as QueuedTransaction | undefined;
        if (!existing) {
          resolve();
          return;
        }

        const updated: QueuedTransaction = {
          ...existing,
          retryCount,
          lastError
        };

        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error ?? new Error('Failed to update queue metadata'));
      };
      request.onerror = () => reject(request.error ?? new Error('Failed to load queued transaction'));
    });
  }

  async dequeue(id: string): Promise<void> {
    await this.runTransaction<void>('readwrite', (store, resolve) => {
      store.delete(id);
      resolve();
    });
  }

  async clear(): Promise<void> {
    await this.runTransaction<void>('readwrite', (store, resolve) => {
      store.clear();
      resolve();
    });
  }
}

export const offlineQueueService = new OfflineQueueService();