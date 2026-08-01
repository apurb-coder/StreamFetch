/**
 * BullMQ Background Task Job Queue Manager
 * 
 * Sets up the BullMQ queue that interfaces with Redis to submit extraction tasks.
 * Includes connection resilience, fail-safe event hooks, and automated cleanup rules.
 */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import config from '../../config/default.js';

class JobQueueManager {
  constructor() {
    this.queueName = 'youtube-extraction';
    this.hasLoggedError = false;

    // Dedicated Redis connection with exponential retry strategy
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
        console.error('[JobQueue] Redis connection error:', err.message);
        this.hasLoggedError = true;
      }
    });

    this.connection.on('connect', () => {
      this.hasLoggedError = false;
      console.log('[JobQueue] Connected to Redis successfully.');
    });

    // Initialize the queue
    this.queue = new Queue(this.queueName, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour to support polling/retrieval
          count: 100 // Keep up to 100 jobs to limit Redis memory footprint
        },
        removeOnFail: {
          age: 3600 * 2, // Keep failed jobs for 2 hours for diagnostic/telemetry access
          count: 50      // Keep up to 50 jobs
        }
      }
    });
  }

  /**
   * Pushes a new extraction job to the background queue
   * @param {string} url - YouTube URL to extract
   * @param {string} quality - Quality specification
   * @returns {Promise<string>} The generated Job ID
   */
  async addJob(url, quality) {
    const job = await this.queue.add('extract', { url, quality });
    console.log(`[JobQueue] Job ${job.id} added for: ${url} (Quality: ${quality})`);
    return job.id;
  }

  /**
   * Fetches a job by ID from the queue database
   * @param {string} jobId - The Job ID
   * @returns {Promise<Job|null>} The BullMQ Job instance or null
   */
  async getJob(jobId) {
    try {
      return await this.queue.getJob(jobId);
    } catch (err) {
      console.error(`[JobQueue] Error fetching job ${jobId}:`, err.message);
      return null;
    }
  }

  /**
   * Gracefully shuts down connections during server close
   */
  async shutdown() {
    console.log('[JobQueue] Shutting down queue and Redis connection...');
    await this.queue.close();
    await this.connection.quit();
  }
}

export default new JobQueueManager();
