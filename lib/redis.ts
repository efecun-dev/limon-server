import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Prevent multiple connections in development mode when hot reloading
const globalForRedis = global as unknown as { redis: Redis };

export const redis = globalForRedis.redis || new Redis(redisUrl, {
  // Eğer Redis sunucusu yoksa veya kapalıysa uygulamayı çökertme, sessizce es geç
  maxRetriesPerRequest: 0,
  retryStrategy: () => null,
});

// Hataları terminalde spamlamaması için error event'ini boş yakala
redis.on('error', (err) => {
  // İsterseniz loglayabilirsiniz, şimdilik spam yapmaması için kapalı
});

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;
