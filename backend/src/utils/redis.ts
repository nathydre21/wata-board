import Redis, { type RedisOptions } from 'ioredis';
import logger from './logger';

const REDIS_URL = process.env.REDIS_URL;

const baseOptions: RedisOptions = {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false,
  retryStrategy: (times) => Math.min(times * 200, 2000),
  reconnectOnError: () => true,
};

let publisher: Redis | null = null;
let subscriber: Redis | null = null;

function makeClient(role: 'pub' | 'sub'): Redis {
  if (!REDIS_URL) {
    throw new Error('REDIS_URL is not set — required for HA WebSocket fan-out');
  }
  const client = new Redis(REDIS_URL, baseOptions);
  client.on('error', (err) => logger.error(`Redis ${role} error`, { error: err.message }));
  client.on('connect', () => logger.info(`Redis ${role} connected`));
  client.on('reconnecting', () => logger.warn(`Redis ${role} reconnecting`));
  return client;
}

export function getPublisher(): Redis {
  if (!publisher) publisher = makeClient('pub');
  return publisher;
}

export function getSubscriber(): Redis {
  if (!subscriber) subscriber = makeClient('sub');
  return subscriber;
}

export function isRedisEnabled(): boolean {
  return Boolean(REDIS_URL);
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([publisher?.quit(), subscriber?.quit()]);
  publisher = null;
  subscriber = null;
}
