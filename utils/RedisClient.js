const Redis = require('ioredis');

let client;

const getRedisClient = () => {
    if (!process.env.REDIS_URL) {
        return null;
    }

    if (!client) {
        client = new Redis(process.env.REDIS_URL, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            retryStrategy: (attempt) => Math.min(attempt * 200, 2000)
        });

        client.on('error', (error) => {
            console.error('Redis connection error:', error.message);
        });
    }

    if (client.status === 'wait') {
        client.connect().catch(() => {});
    }

    return client;
};

const getCachedValue = async (key) => {
    const redis = getRedisClient();

    if (!redis) {
        return null;
    }

    try {
        return await redis.get(key);
    } catch {
        return null;
    }
};

const setCachedValue = async (key, value, ttlSeconds) => {
    const redis = getRedisClient();

    if (!redis) {
        return;
    }

    try {
        await redis.set(key, value, 'EX', ttlSeconds);
    } catch {
        // The cache is optional; callers can continue without it.
    }
};

module.exports = {
    getCachedValue,
    setCachedValue
};