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
  private interval: NodeJS.Timeout | null = null;

  constructor() {
    this.startBackgroundProcessor();
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
        } else {
          this.tasks.delete(task.id);
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
}

export const scheduledPaymentService = new ScheduledPaymentService();