import { Redis } from 'ioredis'; 
import { env } from './env.js';

export const redis = new Redis(env.REDIS_URL!);

redis.on('error', (err) => {
  console.error('Redis Connection Error:', err);
});

redis.on('connect', async () => {
  await redis.config('SET', 'notify-keyspace-events', 'Ex');
  console.log('Keyspace notifications enabled');
  console.log('Successfully connected to Redis');
});