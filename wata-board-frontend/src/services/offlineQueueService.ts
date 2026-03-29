export interface QueuedTransaction {
  id: string;
  payload: any;
  timestamp: number;
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

  async getQueue(): Promise<QueuedTransaction[]> {
    const db = await this.openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
    });
  }

  async enqueue(payload: any) {
    const db = await this.openDB();
    const transaction = db.transaction(this.storeName, 'readwrite');
    const store = transaction.objectStore(this.storeName);
    store.add({
      id: crypto.randomUUID(),
      payload,
      timestamp: Date.now()
    });
  }

  async dequeue(id: string) {
    const db = await this.openDB();
    const transaction = db.transaction(this.storeName, 'readwrite');
    const store = transaction.objectStore(this.storeName);
    store.delete(id);
  }
}

export const offlineQueueService = new OfflineQueueService();