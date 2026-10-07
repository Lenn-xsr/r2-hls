import IORedis, { RedisOptions } from 'ioredis';

/**
 * BullMQ requires `maxRetriesPerRequest: null` on its connection.
 *
 * Queue Redis is kept separate from the cache Redis: prefer a dedicated
 * instance via REDIS_QUEUE_URL; otherwise fall back to the shared host with a
 * distinct DB index + key prefix so it never collides with the cache.
 */
export function createQueueConnection(): IORedis {
  const queueUrl = process.env.REDIS_QUEUE_URL;

  if (queueUrl) {
    return new IORedis(queueUrl, { maxRetriesPerRequest: null });
  }

  const options: RedisOptions = {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD,
    db: Number(process.env.REDIS_QUEUE_DB ?? 1),
    maxRetriesPerRequest: null,
  };

  return new IORedis(options);
}

export const QUEUE_PREFIX = process.env.REDIS_QUEUE_PREFIX ?? 'bull';
