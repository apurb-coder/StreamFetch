import { execFile } from 'child_process';
import { promisify } from 'util';
import config from '../../config/default.js';
import proxyManager from './proxyManager.js';
import ResponseOptimizer from '../utils/optimizer.js';

const execFileAsync = promisify(execFile);

class Extractor {
  constructor() {
    this.timeout = config.extractor.timeoutMs || 25000;
    this.ytDlpPath = config.extractor.binaryPath || 'yt-dlp';
    this.activeJobs = new Set();
  }

  async extract(url, options = {}, attempt = 0) {
    const proxy = proxyManager.getRandomProxy();
    const args = [
      url,
      '--dump-json',
      '--no-download',
      '--no-playlist',
      '--no-check-formats',
      '--flat-playlist',
      '--socket-timeout', String(Math.floor(this.timeout / 1000)),
      '--retries', '2',
      '--fragment-retries', '2',
      '--no-color',
      '--no-progress',
      '--no-warnings',
      '--ignore-errors',
      '--format-sort', 'quality'
    ];

    if (proxy) args.push('--proxy', proxy);

    // Build YouTube extractor args: tv client bypasses datacenter IP & botguard checks on cloud hosts (Render/AWS)
    let ytArgs = 'youtube:player_client=tv,android';

    const poToken = options.poToken || process.env.YT_PO_TOKEN;
    const visitorData = options.visitorData || process.env.YT_VISITOR_DATA;

    if (poToken && poToken.length > 40) {
      ytArgs += `;po_token=web+${poToken}`;
      if (visitorData) {
        ytArgs += `;visitor_data=${visitorData}`;
      }
    }
    args.push('--extractor-args', ytArgs);

    if (options.quality && options.quality !== 'best') {
      args.push('-f', `bestvideo[height<=${options.quality}]+bestaudio/best[height<=${options.quality}]`);
    } else {
      args.push('-f', 'bestvideo+bestaudio/best');
    }

    const env = { ...process.env, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' };
    const jobId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.activeJobs.add(jobId);

    try {
      const { stdout } = await execFileAsync(this.ytDlpPath, args, {
        timeout: this.timeout,
        maxBuffer: 3 * 1024 * 1024,
        env,
        killSignal: 'SIGTERM'
      });

      this.activeJobs.delete(jobId);
      if (!stdout?.trim()) throw new Error('yt-dlp returned empty stdout');
      return ResponseOptimizer.clean(JSON.parse(stdout));
    } catch (error) {
      this.activeJobs.delete(jobId);
      const errorMsg = error.message.toLowerCase();
      const isRetryable = ['etimedout', 'econnreset', 'econnrefused', '429', 'too many requests', 'rate limit', 'http error 403', 'confirm you’re not a bot'].some(p => errorMsg.includes(p));

      if (attempt < 2 && isRetryable) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        return this.extract(url, options, attempt + 1);
      }
      throw error;
    }
  }

  async updateBinary() {
    // Skip runtime self-update in production (Docker build already fetches latest yt-dlp)
    if (process.env.NODE_ENV === 'production') return;

    try {
      const { stdout } = await execFileAsync(this.ytDlpPath, ['-U']);
      console.log(`[yt-dlp] Auto-update status: ${stdout.trim()}`);
      return stdout;
    } catch (err) {
      console.warn(`[yt-dlp] Could not auto-update binary automatically: ${err.message}`);
    }
  }

  async shutdown() {
    this.activeJobs.clear();
  }
}

export default new Extractor();
