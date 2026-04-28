import { logger } from '../utils/logger';

export interface ScheduledTask {
  id: string;
  scheduleId: string;
  nextExecution: Date;
  userId: string;
  meterId: string;
  amount: number;
  frequency: 'once' | 'daily' | 'weekly' | 'monthly';
}

export class ScheduledPaymentService {
  private tasks: Map<string, ScheduledTask> = new Map();
  private interval: ReturnType<typeof setInterval> | null = null;
  private dbName = 'wata_board_offline';
  private storeName = 'scheduled_payment_queue';

  constructor() {
    void this.restorePersistedTasks();
    this.startBackgroundProcessor();
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 2);
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

  private async persistTask(task: ScheduledTask): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    store.put({
      ...task,
      nextExecution: task.nextExecution.toISOString()
    });
  }

  private async removePersistedTask(taskId: string): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    store.delete(taskId);
  }

  private async restorePersistedTasks(): Promise<void> {
    try {
      const db = await this.openDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const persistedTasks = (request.result ?? []) as Array<Omit<ScheduledTask, 'nextExecution'> & { nextExecution: string }>;
        persistedTasks.forEach((task) => {
          this.tasks.set(task.id, {
            ...task,
            nextExecution: new Date(task.nextExecution)
          });
        });
      };
    } catch (error) {
      logger.error('Failed to restore scheduled payment queue', error);
    }
  }

  private startBackgroundProcessor() {
    this.interval = setInterval(() => this.processDuePayments(), 60000);
    logger.info('Scheduled Payment Processor started');
  }

  private async processDuePayments() {
    const now = new Date();
    const dueTasks = Array.from(this.tasks.values()).filter(t => t.nextExecution <= now);

    for (const task of dueTasks) {
      try {
        logger.info(`Executing scheduled payment for schedule ${task.scheduleId}`);
        await this.executeTransaction(task);
        
        if (task.frequency !== 'once') {
          this.rescheduleTask(task);
          await this.persistTask(task);
        } else {
          this.tasks.delete(task.id);
          await this.removePersistedTask(task.id);
        }
      } catch (err) {
        logger.error(`Scheduled payment failed for ${task.scheduleId}: ${err}`);
      }
    }
  }

  private rescheduleTask(task: ScheduledTask) {
    const nextDate = new Date(task.nextExecution);
    if (task.frequency === 'daily') nextDate.setDate(nextDate.getDate() + 1);
    else if (task.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
    else if (task.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
    
    task.nextExecution = nextDate;
    logger.info(`Rescheduled task ${task.id} for ${nextDate.toISOString()}`);
  }

  private async executeTransaction(task: ScheduledTask) {
    return new Promise(resolve => setTimeout(resolve, 1000));
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
  }

  async registerTask(task: ScheduledTask): Promise<void> {
    this.tasks.set(task.id, task);
    await this.persistTask(task);
  }

  async unregisterTask(taskId: string): Promise<void> {
    this.tasks.delete(taskId);
    await this.removePersistedTask(taskId);
  }
}

export const scheduledPaymentService = new ScheduledPaymentService();