/**
 * BullMQ Background Task Job Worker
 * 
 * Sets up a background job worker queue that listens for extraction tasks pushed to Redis.
 * Useful for offloading batch jobs, scheduler extractions, or queuing requests
 * when the server experiences high traffic surges.
 * 
 * Integrates directly with our underlying `ExtractionPool` thread manager.
 * 
 * It consumes the JOBS from the queue and give it to the extractor.js(Manager of workers)
 */

import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import config from '../../config/default.js';
import extractionPool from '../core/extractor.js';
import cacheManager from '../core/cacheManager.js';

class JobProcessor {
  constructor() {
    this.queueName = 'youtube-extraction';
    
    this.hasLoggedError = false;

    // Spawn dedicated Redis connection for the queue worker with backoff retry
    this.connection = new IORedis(config.redis.url, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      retryStrategy(times) {
        // Back off exponentially: 1s, 2s, 4s, 8s, up to 30s
        return Math.min(Math.pow(2, times) * 1000, 30000);
      }
    });

    this.connection.on('error', (err) => {
      if (!this.hasLoggedError) {
        console.error('[JobProcessor] Redis connection error:', err.message);
        this.hasLoggedError = true;
      }
    });

    this.connection.on('connect', () => {
      this.hasLoggedError = false;
    });

    this.worker = null;
  }

  /**
   * Initializes the BullMQ Worker daemon
   */
  start() {
    console.log(`[JobProcessor] Starting BullMQ worker on queue: "${this.queueName}"...`);

    this.worker = new Worker(
      this.queueName,
      async (job) => {
        const { url, quality, poToken, visitorData } = job.data;
        console.log(`[JobProcessor] Picked up job ${job.id} for: ${url}`);

        try {
          // Progress feedback update
          await job.updateProgress(10); // 10% progress

          // Process extraction through core worker thread pool
          const metadata = await extractionPool.extract(url, { quality, poToken, visitorData });

          // Save to cache pool (shorter TTL for common videos, longer TTL for popular hits)
          const cacheKey = `extract:${url}:${quality || 'best'}`;
          const ttl = metadata.viewCount > 1000000 ? 10800000 : 3600000; // 3 hours vs 1 hour
          cacheManager.set(cacheKey, metadata, { ttl, hot: metadata.viewCount > 1000000 });

          await job.updateProgress(100); // 100% progress
          
          // Return value resolves the job successfully inside Redis
          return metadata;
        } catch (error) {
          console.error(`[JobProcessor] Job failed for URL ${url}:`, error.message);
          throw error; // Re-throwing fails the job in BullMQ
        }
      },
      {
        connection: this.connection,
        concurrency: config.extractor.maxWorkers || 4, // Align concurrency with thread limits
        limiter: {
          max: 10,       // Max 10 executions
          duration: 1000 // per 1 second
        }
      }
    );

    // Event hooks
    this.worker.on('completed', (job) => {
      console.log(`[JobProcessor] Job ${job.id} completed successfully.`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[JobProcessor] Job ${job ? job.id : 'unknown'} failed:`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('[JobProcessor] BullMQ worker critical runtime error:', err);
    });
  }

  /**
   * Wipes connections clean during server shutdown
   */
  async shutdown() {
    if (this.worker) {
      console.log('[JobProcessor] Stopping BullMQ job processor...');
      await this.worker.close();
    }
    await this.connection.quit();
  }
}

export default new JobProcessor();
