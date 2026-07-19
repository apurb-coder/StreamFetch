import { LRUCache } from 'lru-cache';

class CacheManager {
  constructor() {
    this.cache = new LRUCache({
      max: 10000,
      maxSize: 500 * 1024 * 1024,
      sizeCalculation: (value) => JSON.stringify(value).length,
      ttl: 1000 * 60 * 60, // 1 hour standard TTL
      updateAgeOnGet: true
    });
    this.stats = { hits: 0, misses: 0 };
  }

  get(key) {
    const val = this.cache.get(key);
    val !== undefined ? this.stats.hits++ : this.stats.misses++;
    return val !== undefined ? val : null;
  }

  set(key, value, options = {}) {
    const ttl = options.ttl || 3600000;
    this.cache.set(key, value, { ttl: (options.hot || value?.viewCount > 1000000) ? ttl * 3 : ttl });
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      l1Hits: this.stats.hits,
      l2Hits: 0,
      l1Size: this.cache.size,
      l2Size: 0,
      hitRate: total ? this.stats.hits / total : 0
    };
  }

  clear() {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
  }
}

export default new CacheManager();
