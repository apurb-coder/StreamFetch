/**
 * Cache Manager and Multi-layer caching Supervisor
 * 
 * Implements standard L1 and L2 local cache pools (using lru-cache package)
 * to speed up duplicate extraction runs and avoid API throttling from YouTube.
 */

const LRUCache = require('lru-cache');

class CacheManager {
  constructor() {
    // Multi-layer caching
    this.l1Cache = new LRUCache({
      max: 1000,              // 1000 items
      maxSize: 50 * 1024 * 1024, // 50MB
      sizeCalculation: (value) => JSON.stringify(value).length,
      ttl: 1000 * 60 * 60,    // 1 hour
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });
    
    this.l2Cache = new LRUCache({
      max: 10000,             // 10000 items
      maxSize: 500 * 1024 * 1024, // 500MB
      sizeCalculation: (value) => JSON.stringify(value).length,
      ttl: 1000 * 60 * 180,   // 3 hours
      updateAgeOnGet: true
    });
    
    // Stats tracking
    this.stats = {
      hits: 0,
      misses: 0,
      l1Hits: 0,
      l2Hits: 0
    };
  }
  
  get(key) {
    // Check L1 cache (fastest)
    const l1Result = this.l1Cache.get(key);
    if (l1Result !== undefined) {
      this.stats.hits++;
      this.stats.l1Hits++;
      return l1Result;
    }
    
    // Check L2 cache
    const l2Result = this.l2Cache.get(key);
    if (l2Result !== undefined) {
      this.stats.hits++;
      this.stats.l2Hits++;
      // Promote to L1
      this.l1Cache.set(key, l2Result);
      return l2Result;
    }
    
    this.stats.misses++;
    return null;
  }
  
  set(key, value, options = {}) {
    const ttl = options.ttl || 3600000; // 1 hour default
    
    // Always set in L1
    this.l1Cache.set(key, value, { ttl });
    
    // Set in L2 for hot items
    if (options.hot || this.isViralContent(value)) {
      this.l2Cache.set(key, value, { ttl: ttl * 3 }); // 3x TTL for hot content
    }
  }
  
  isViralContent(value) {
    // Check if video is popular (likely to be requested again)
    return value?.viewCount > 1000000 || 
           value?.likeCount > 100000;
  }
  
  getStats() {
    return {
      ...this.stats,
      l1Size: this.l1Cache.size,
      l2Size: this.l2Cache.size,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
    };
  }
  
  clear() {
    this.l1Cache.clear();
    this.l2Cache.clear();
    this.stats = { hits: 0, misses: 0, l1Hits: 0, l2Hits: 0 };
  }
}

module.exports = new CacheManager();
