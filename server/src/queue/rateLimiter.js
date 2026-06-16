/**
 * Redis-Backed High-Performance Rate Limiting Middleware
 * 
 * Implements a Sliding Window Log algorithm powered by Redis Sorted Sets (ZADD/ZREM).
 * Controls three concurrent boundary layers:
 *  - Global Layer: Limits overall traffic to protect database/CPU workloads (10 req/s)
 *  - IP Layer: Caps single connection speed to prevent DDoS and spamming (5 req/s)
 *  - User/Token Layer: Limits specific API Key/User account quotas (30 req/min)
 * 
 * Exceeded limits trigger an automatic temporary block using Redis key expiry (EX).
 * Falls back automatically and gracefully to a high-speed in-memory LRU cache if Redis is down/disconnected.
 */

import IORedis from 'ioredis';
import { LRUCache } from 'lru-cache'; // if redis fails, we will use this to maintain a LRU-cache locally
import config from '../../config/default.js';

class RateLimiter {
  constructor() {
    this.isRedisConnected = false;
    this.hasLoggedError = false;
    this.hasLoggedFallback = false;

    // Spawn standard independent Redis client with an exponential retry backoff
    this.connection = new IORedis(config.redis.url, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      connectTimeout: 5000,
      retryStrategy(times) {
        // Back off exponentially: 1s, 2s, 4s, 8s, up to a max of 30s
        return Math.min(Math.pow(2, times) * 1000, 30000);
      }
    });

    this.connection.on('connect', () => {
      this.isRedisConnected = true;
      this.hasLoggedError = false;
      this.hasLoggedFallback = false;
      console.log('[RateLimiter] Connected to Redis. Distributed sliding window rate limiting active.');
    });

    this.connection.on('error', (err) => {
      this.isRedisConnected = false;
      if (!this.hasLoggedError) {
        console.error('[RateLimiter] Redis connection error:', err.message);
        this.hasLoggedError = true;
      }
    });

    this.connection.on('close', () => {
      this.isRedisConnected = false;
      if (!this.hasLoggedFallback) {
        console.warn('[RateLimiter] Redis connection closed. Gracefully falling back to in-memory sliding window rate limits.');
        this.hasLoggedFallback = true;
      }
    });

    // Mirror settings from configuration defaults
    this.config = {
      global: config.rateLimits.global,
      perIP: config.rateLimits.ip,
      perUser: config.rateLimits.user
    };

    // Resilient local memory caches for rate limiting fallback
    this.localCache = new LRUCache({
      max: 5000,
      ttl: 1000 * 60 * 5 // 5 minutes standard maximum slide
    });

    this.blockedCache = new LRUCache({
      max: 1000,
      ttl: 1000 * 60 // 1 minute default block
    });
  }

  /**
   * In-Memory sliding-window log rate-limiting fallback
   * @param {string} identifier - Unique client key
   * @param {string} type - Threshold config type ('global', 'perIP', 'perUser')
   * @returns {boolean} True if client remains under limits
   */
  checkRateLimitMemory(identifier, type = 'perIP') {
    const key = `rate_limit:${type}:${identifier}`;
    const blockKey = `rate_limit:blocked:${type}:${identifier}`;
    const limitConfig = this.config[type];

    if (!limitConfig) return true;

    // 1. Check if blocked
    if (this.blockedCache.has(blockKey)) {
      return false;
    }

    const now = Date.now();
    const clearBefore = now - limitConfig.duration * 1000;

    // 2. Get and slide window timestamps
    let timestamps = this.localCache.get(key) || [];
    timestamps = timestamps.filter(t => t > clearBefore);
    timestamps.push(now);

    // 3. Save sliding window
    this.localCache.set(key, timestamps, { ttl: limitConfig.duration * 2 * 1000 });

    // 4. Validate limit bounds
    if (timestamps.length > limitConfig.points) {
      this.blockedCache.set(blockKey, '1', { ttl: limitConfig.blockDuration * 1000 });
      console.warn(`[RateLimiter] [LOCAL FALLBACK] Rate limit exceeded on ${type} for key: ${identifier}. Blocked for ${limitConfig.blockDuration}s.`);
      return false;
    }

    return true;
  }

  /**
   * sliding-window rate limit checker using Redis transactions (multi)
   * @param {string} identifier - Unique client key (e.g. IP, API key)
   * @param {string} type - Threshold config type ('global', 'perIP', 'perUser')
   * @returns {Promise<boolean>} True if transaction succeeds and client remains under limits
   */
  async checkRateLimit(identifier, type = 'perIP') {
    const key = `rate_limit:${type}:${identifier}`;
    const blockKey = `rate_limit:blocked:${type}:${identifier}`;
    const limitConfig = this.config[type];

    if (!limitConfig) return true; // Fail-open if type is unrecognized

    // Resilient fallback: Use local-memory rate-limiter if Redis connection is not established or status is not ready
    if (!this.isRedisConnected || !this.connection || this.connection.status !== 'ready') {
      return this.checkRateLimitMemory(identifier, type);
    }

    try {
      // 1. Check if identifier is already marked blocked
      const isBlocked = await this.connection.get(blockKey);
      if (isBlocked) {
        return false;
      }

      const now = Date.now();
      const clearBefore = now - limitConfig.duration * 1000;

      // Use transaction pipeline to bundle atomicity operations
      const multi = this.connection.multi();

      // - Drop request entries outside the current sliding time frame
      multi.zremrangebyscore(key, 0, clearBefore);
      // - Record this active request with unique random suffix
      multi.zadd(key, now, `${now}-${Math.random()}`);
      // - Count total elements left inside the set
      multi.zcard(key);
      // - Push expiration on key (duration * 2 as a safe cleanup cushion)
      multi.expire(key, limitConfig.duration * 2);

      const results = await multi.exec();
      
      // ZCARD command is at result index 2, with value matching array index 1
      const requestCount = results[2][1];

      if (requestCount > limitConfig.points) {
        // Limit exceeded: Set temporary Redis block blockKey
        await this.connection.set(
          blockKey,
          '1',
          'EX',
          limitConfig.blockDuration
        );
        console.warn(`[RateLimiter] Rate limit exceeded on ${type} for key: ${identifier}. Blocked for ${limitConfig.blockDuration}s.`);
        return false;
      }

      return true;
    } catch (err) {
      console.error(`[RateLimiter] Redis transaction failed for ${type} limit check:`, err.message);
      // Inline fallback if Redis error occurs mid-operation
      return this.checkRateLimitMemory(identifier, type);
    }
  }

  /**
   * Express middleware interceptor
   */
  middleware() {
    return async (req, res, next) => {
      try {
        const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';
        const apiKey = req.headers['x-api-key'] || 'anonymous';

        // 1. Verify Aggregate Global protection limits
        const globalAllowed = await this.checkRateLimit('global', 'global');
        if (!globalAllowed) {
          return res.status(429).json({
            success: false,
            error: 'Too Many Requests',
            message: 'Server capacity limits exceeded. Please retry shortly.',
            retryAfter: this.config.global.blockDuration
          });
        }

        // 2. Verify client IP connection speed
        const ipAllowed = await this.checkRateLimit(clientIp, 'perIP');
        if (!ipAllowed) {
          return res.status(429).json({
            success: false,
            error: 'Too Many Requests',
            message: 'Rate limit exceeded for this IP. Please wait.',
            retryAfter: this.config.perIP.blockDuration
          });
        }

        // 3. Verify user API Key quota
        if (apiKey !== 'anonymous') {
          if (apiKey !== config.adminApiKey) {
            return res.status(401).json({
              success: false,
              error: 'Unauthorized',
              message: 'Invalid API Key'
            });
          }
          const userAllowed = await this.checkRateLimit(apiKey, 'perUser');
          if (!userAllowed) {
            return res.status(429).json({
              success: false,
              error: 'Quota Exceeded',
              message: 'Hourly/daily quota exceeded for this API token.',
              retryAfter: this.config.perUser.blockDuration
            });
          }
        }

        next();
      } catch (err) {
        console.error('[RateLimiter] Error during rate-limit calculations:', err);
        // Fail-open: Let requests pass to keep API running if Redis fails in production
        next();
      }
    };
  }
}

export default new RateLimiter();
