/**
 * Dedicated yt-dlp Extraction Thread (Worker Thread)
 * 
 * Runs decoupled inside background CPU threads spawned by the master process.
 * Spawns optimized CLI instances of the `yt-dlp` tool to query YouTube video link schemas
 * without freezing the master process Express event loops.
 * 
 * Implements proxy credentials injection, connection retry policies, and clean response optimizations.
 */

import { parentPort, workerData } from 'worker_threads';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import ResponseOptimizer from '../src/utils/optimizer.js';

const execFileAsync = promisify(execFile);

class ExtractionWorker {
  constructor() {
    this.timeout = workerData.timeout || 25000;
    this.ytDlpPath = workerData.ytDlpPath || 'yt-dlp';
    this.retryCount = 2; // Number of extraction retries before failing a job

    this.setupMessageHandler();
  }

  /**
   * Listens for inbound extraction tasks sent by the Master Thread pool manager
   */
  setupMessageHandler() {
    parentPort.on('message', async (message) => {
      // Handle health-check pings
      if (message.type === 'ping') {
        parentPort.postMessage({ type: 'pong' });
        return;
      }

      const { jobId, url, options, proxy } = message;

      try {
        // Execute extraction with auto-retry fallbacks
        const result = await this.extractWithRetry(url, options, proxy);
        
        // Return cleaned data back to the master process
        parentPort.postMessage({ jobId, data: result });
      } catch (error) {
        parentPort.postMessage({ jobId, error: error.message });
      }
    });
  }

  /**
   * Asynchronously attempts extraction, retrying with exponential backoff on retryable failures
   */
  async extractWithRetry(url, options, proxy, attempt = 0) {
    try {
      return await this.extract(url, options, proxy);
    } catch (error) {
      const isRetryable = this.isRetryableError(error);
      
      console.warn(`[Extraction Worker Thread] Attempt ${attempt + 1} failed for ${url}. Retryable: ${isRetryable}. Error: ${error.message}`);

      if (attempt < this.retryCount && isRetryable) {
        // Wait using exponential backoff (e.g. 1s, 2s) before retrying
        await this.sleep(Math.pow(2, attempt) * 1000);
        return this.extractWithRetry(url, options, proxy, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Spawns a child subprocess running the yt-dlp binary with optimized flags
   * @param {string} url - YouTube URL
   * @param {Object} options - Extraction request configurations (quality limits)
   * @param {string|null} proxy - Proxy gateway credential string
   * @returns {Promise<Object>} Streamlined video metadata
   */
  async extract(url, options = {}, proxy = null) {
    // Highly-optimized CLI parameters for rapid metadata extraction without media downloads
    const args = [
      url,
      '--dump-json',          // Output JSON structure directly to stdout
      '--no-download',        // Prevent actual media video downloading
      '--no-playlist',        // Only extract the specific target video
      '--no-check-formats',   // Skip heavy formatting check handshakes to speed up responses
      '--flat-playlist',      // Disable expanding nested playlists
      '--socket-timeout', String(Math.floor(this.timeout / 1000)), // Limit socket timeouts
      '--retries', '2',
      '--fragment-retries', '2',
      '--no-color',
      '--no-progress',
      '--no-warnings',
      '--ignore-errors',
      '--format-sort', 'quality'
    ];

    // Inject proxy configuration parameters if supplied
    if (proxy) {
      args.push('--proxy', proxy);
    }

    // Append requested resolution thresholds (defaults to high-quality audio+video merges)
    if (options.quality && options.quality !== 'best') {
      const q = options.quality;
      args.push('-f', `bestvideo[height<=${q}]+bestaudio/best[height<=${q}]`);
    } else {
      args.push('-f', 'bestvideo+bestaudio/best');
    }

    // Force clean UTF-8 environment strings to avoid string parsing exceptions
    const env = {
      ...process.env,
      LC_ALL: 'en_US.UTF-8',
      LANG: 'en_US.UTF-8'
    };

    // Execute the binary file
    const { stdout } = await execFileAsync(this.ytDlpPath, args, {
      timeout: this.timeout,
      maxBuffer: 3 * 1024 * 1024, // Expanded 3MB memory buffer for massive format outputs
      env,
      killSignal: 'SIGTERM'
    });

    if (!stdout || stdout.trim() === '') {
      throw new Error('yt-dlp returned an empty standard output payload');
    }

    // Parse the returned output string
    const rawInfo = JSON.parse(stdout);
    
    // Clean and optimize heavy yt-dlp details using ResponseOptimizer
    return ResponseOptimizer.clean(rawInfo);
  }

  /**
   * Determines if a thrown extraction error is recoverable by retrying
   */
  isRetryableError(error) {
    const errorMsg = error.message.toLowerCase();
    const retryablePhrases = [
      'etimedout',
      'econnreset',
      'econnrefused',
      '429',
      'too many requests',
      'rate limit',
      'http error 403',
      'sign in to confirm you’re not a bot'
    ];
    return retryablePhrases.some(phrase => errorMsg.includes(phrase));
  }

  /**
   * Basic async sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Instantiate the singleton worker listening to standard parent ports
new ExtractionWorker();
