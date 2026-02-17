import { Redis } from 'ioredis';
import { env } from './env.js';

const isProduction = process.env.NODE_ENV === 'production';


const redisOptions = isProduction
  ? {
      // Production: Upstash with TLS
      tls: {
        rejectUnauthorized: true,
      },
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        return Math.min(times * 50, 2000);
      },
      reconnectOnError(err: Error) {
        return err.message.includes('READONLY');
      },
      keepAlive: 30000,
      connectTimeout: 10000,
      enableOfflineQueue: true,
    }
  : {
      // Development: Local Redis
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        return Math.min(times * 50, 2000);
      },
      connectTimeout: 10000,
      enableOfflineQueue: true,
    };

// Primary Redis connection for commands
export const redis = new Redis(
  (isProduction ? env.UPSTASH_REDIS_URL : env.REDIS_URL)!,
  redisOptions
);

// Separate subscriber for pub/sub (for keyspace notifications)
export const subscriber = redis.duplicate();

// Connection handlers
redis.on('error', (err) => {
  console.error('[REDIS] Connection Error:', err);
});

redis.on('connect', async () => {
  console.log(`[REDIS] Connected to ${isProduction ? 'Upstash (Production)' : 'Local Redis (Development)'}`);
  
  try {
    await redis.config('SET', 'notify-keyspace-events', 'Ex');
    console.log('[REDIS] Keyspace notifications enabled');
  } catch (err) {
    if (isProduction) {
      console.warn('[REDIS] Enable keyspace notifications in Upstash Console: notify-keyspace-events = "Ex"');
    } else {
      console.error('[REDIS] Failed to enable keyspace notifications:', err);
    }
  }
});

redis.on('ready', () => {
  console.log('[REDIS] Ready for operations');
});

subscriber.on('connect', () => {
  console.log('[REDIS] Subscriber connected');
});

subscriber.on('error', (err) => {
  console.error('[REDIS] Subscriber Error:', err);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('[REDIS] Closing connections...');
  await redis.quit();
  await subscriber.quit();
  console.log('[REDIS] Connections closed');
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});