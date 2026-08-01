import { execFile } from 'child_process';
import { promisify } from 'util';
import config from '../../config/default.js';
import proxyManager from './proxyManager.js';
import ResponseOptimizer from '../utils/optimizer.js';
import poTokenManager from './poTokenManager.js';

const execFileAsync = promisify(execFile);

class Extractor {
  constructor() {
    this.timeout = config.extractor.timeoutMs || 25000;
    this.ytDlpPath = config.extractor.binaryPath || 'yt-dlp';
    this.activeJobs = new Set();
  }

  cleanUrl(urlStr) {
    try {
      const parsed = new URL(urlStr);
      if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')) {
        const v = parsed.searchParams.get('v');
        if (v) return `https://www.youtube.com/watch?v=${v}`;
      }
    } catch (e) {}
    return urlStr;
  }

  async extract(url, options = {}, attempt = 0) {
    const cleanTargetUrl = this.cleanUrl(url);
    const proxy = proxyManager.getRandomProxy();
    const args = [
      cleanTargetUrl,
      '--dump-json',
      '--no-download',
      '--no-playlist',
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

    // Fetch active Server-Side PoToken & VisitorData
    const { poToken, visitorData } = await poTokenManager.getPoToken();
    
    // Multi-client fallback sequence: ios -> android -> mweb -> web_embedded -> tv -> web
    let ytArgs = 'youtube:player_client=ios,android,mweb,web_embedded,tv,web';

    if (poToken) {
      ytArgs += `;po_token=web+${poToken}`;
      if (visitorData) {
        ytArgs += `;visitor_data=${visitorData}`;
      }
    }
    args.push('--extractor-args', ytArgs);

    if (options.quality && options.quality !== 'best') {
      args.push('-f', `bestvideo[height<=${options.quality}]+bestaudio/best[height<=${options.quality}]/b/best`);
    } else {
      args.push('-f', 'bestvideo+bestaudio/b/best');
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
