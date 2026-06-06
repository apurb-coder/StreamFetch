/**
 * yt-dlp Extraction Worker Pool Manager (Master Thread)
 * 
 * Spawns, balances, and orchestrates a fixed pool of Node.js background `worker_threads`.
 * Delegates heavy child CPU processes running `yt-dlp` dumps off the main Express event loop
 * to secure optimal, non-blocking throughput.
 * 
 * Includes worker crash auto-respawn and task isolation timeouts.
 * This is the Manager of workers: Manages the workers, initiates the workers, if worker does safely closes it and replace it with new workers, distributes tasks among workers
 */


import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import config from '../../config/default.js';
import proxyManager from './proxyManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ExtractionPool extends EventEmitter {
  constructor() {
    super();
    this.maxWorkers = config.extractor.maxWorkers || 4;
    this.timeout = config.extractor.timeoutMs || 25000;
    this.workers = [];        // Running worker thread instances
    this.queue = [];          // Pending extraction jobs backlog
    this.activeJobs = new Map(); // Currently running job records (jobId => jobObj)

    // Delay pool startup slightly to allow proxy manager to complete initial health checks
    setTimeout(() => this.spawnPool(), 1000);

    // Register simple worker health-monitoring interval (Runs every 30 seconds)
    setInterval(() => this.healthCheck(), 30000);
  }

  /**
   * Spawns worker threads up to configured limits
   */
  spawnPool() {
    console.log(`[ExtractionPool] Provisioning worker pool size: ${this.maxWorkers}...`);
    for (let i = 0; i < this.maxWorkers; i++) {
      this.spawnWorker();
    }
  }

  /**
   * Spawns a single child worker thread and hooks standard lifecycle events
   */
  spawnWorker() {
    const workerFilePath = path.join(__dirname, '..', '..', 'workers', 'extractionWorker.js');
    
    const worker = new Worker(workerFilePath, {
      workerData: {
        timeout: this.timeout,
        ytDlpPath: config.extractor.binaryPath
      }
    });

    // Handle inbound messages returning extracted metadata payload[message sent by the worker]
    worker.on('message', (result) => {
      // Handle simple diagnostics ping responses
      if (result.type === 'pong') {
        worker.lastActive = Date.now();
        return;
      }

      const { jobId, data, error } = result;
      const job = this.activeJobs.get(jobId);

      if (job) {
        clearTimeout(job.timer); // Cancel request timeout
        this.activeJobs.delete(jobId);

        if (error) {
          job.reject(new Error(error));
        } else {
          job.resolve(data);
        }

        // Trigger queue sweep since this worker is now free
        this.processQueue(worker);
      }
    });

    // Handle child worker unexpected runtime crash
    worker.on('error', (err) => {
      console.error(`[ExtractionPool] Critical error on worker thread PID ${worker.threadId}:`, err);
      this.removeWorker(worker);
      this.spawnWorker(); // Replace worker
    });

    // Handle thread close
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.warn(`[ExtractionPool] Worker thread exited with non-zero exit code: ${code}`);
      }
      this.removeWorker(worker);
    });

    worker.lastActive = Date.now();
    this.workers.push(worker);
    return worker;
  }

  /**
   * Safely isolates and discards dead worker thread instances
   */
  removeWorker(worker) {
    this.workers = this.workers.filter(w => w !== worker);
    
    // Clear out active jobs running on this worker
    for (const [jobId, job] of this.activeJobs.entries()) {
      if (job.worker === worker) {
        clearTimeout(job.timer);
        this.activeJobs.delete(jobId);
        job.reject(new Error('Extraction worker terminated unexpectedly'));
      }
    }
  }

  /**
   * Primary entry point: queues or executes extraction queries
   * @param {string} url - YouTube video url
   * @param {Object} options - Video extraction options (quality limit)
   * @returns {Promise<Object>} Cleaned YouTube metadata payload
   */
  extract(url, options = {}) {
    return new Promise((resolve, reject) => {
      const jobId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const job = {
        id: jobId,
        url,
        options,
        resolve,
        reject,
        timestamp: Date.now(),
        // Maximum failsafe task timeout
        timer: setTimeout(() => {
          this.activeJobs.delete(jobId);
          reject(new Error('Extraction job timed out on pool executor'));
        }, this.timeout + 2000)
      };

      // 1. Locate an idle worker thread (not present in activeJobs)
      const busyWorkers = new Set(Array.from(this.activeJobs.values()).map(j => j.worker));
      const idleWorker = this.workers.find(w => !busyWorkers.has(w));

      if (idleWorker) {
        job.worker = idleWorker;
        this.activeJobs.set(jobId, job);
        
        // Fetch fresh rotated proxy credentials
        const proxy = proxyManager.getRandomProxy();
        
        // Dispatch task parameters to thread[message send by the master thread to the worker thread]
        idleWorker.postMessage({ jobId, url, options, proxy });
      } else {
        // Enqueue job if system is currently fully saturated
        this.queue.push(job);
      }
    });
  }

  /**
   * Sweeps and allocates queued jobs to newly freed worker threads
   */
  processQueue(worker) {
    if (this.queue.length > 0) {
      const job = this.queue.shift();
      job.worker = worker;
      this.activeJobs.set(job.id, job);

      const proxy = proxyManager.getRandomProxy();
      worker.postMessage({ jobId: job.id, url: job.url, options: job.options, proxy });
    }
  }

  /**
   * Background monitor: pings thread instances and removes hanging workers
   */
  healthCheck() {
    this.workers.forEach((worker) => {
      // Ping thread to test event loop reactivity
      worker.postMessage({ type: 'ping' });

      // If worker fails to answer pings or remains busy past timeout, replace it
      if (Date.now() - worker.lastActive > this.timeout + 10000) {
        console.warn(`[ExtractionPool] Worker ${worker.threadId} is unresponsive. Terminating...`);
        worker.terminate();
      }
    });
  }

  /**
   * Gracefully terminates worker pool instances (used during server shutdown)
   */
  async shutdown() {
    console.log('[ExtractionPool] Shutting down worker thread pool...');
    const terminations = this.workers.map(w => w.terminate());
    await Promise.all(terminations);
    this.workers = [];
    this.activeJobs.clear();
    this.queue = [];
  }
}

export default new ExtractionPool();
