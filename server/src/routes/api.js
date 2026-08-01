/**
 * Express REST API Routes definition
 * 
 * Mounts standard endpoint targets:
 *  - POST /api/extract             : Enqueues single video link extraction (cached)
 *  - POST /api/extract/audio       : Enqueues audio-only link extraction (cached)
 *  - POST /api/extract/batch       : Enqueues/processes multiple extractions concurrently
 *  - POST /api/formats             : Enqueues streamlined format spec extraction
 *  - GET  /api/extract/status/:id  : Polls background extraction task statuses (supports filters)
 *  - GET  /api/stats               : System stats diagnostic telemetry (protected)
 * 
 * Utilizes rate limit guards and strictly enforces request body validations.
 */

import express from 'express';
const router = express.Router();

import extractionPool from '../core/extractor.js';
import cacheManager from '../core/cacheManager.js';
import rateLimiter from '../queue/rateLimiter.js';
import ResponseOptimizer from '../utils/optimizer.js';
import security from '../core/security.js';
import jobQueue from '../queue/jobQueue.js';
import { 
  validateExtractionRequest, 
  validateBatchRequest, 
  checkValidationResult 
} from '../utils/validator.js';
import config from '../../config/default.js';

// Apply rate limiting middleware to all incoming API transactions
router.use(rateLimiter.middleware());

/**
 * GET /api/handshake
 * Generates an ephemeral cryptographic token for the frontend to sign subsequent requests.
 */
router.get('/handshake', (req, res) => {
  // 1. Basic sanity header check to block primitive automated scraping scripts
  if (!security.isAuthenticBrowser(req)) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Access denied. Browser verification checks failed.'
    });
  }

  // 2. Issue dynamic app token
  const token = security.generateAppToken();

  res.json({
    success: true,
    token: token,
    expiresInMs: security.tokenExpiryMs
  });
});

/**
 * POST /api/extract & /api/extract/audio
 * Extracts direct stream links for a single YouTube URL.
 * Checks cache first, otherwise queues a background job.
 */
router.post(
  ['/extract', '/extract/audio'],
  security.verifySignatureMiddleware(),
  validateExtractionRequest,
  checkValidationResult,
  async (req, res) => {
    const { url, quality, poToken, visitorData } = req.body;
    const isAudio = req.path.includes('audio');
    const resolvedQuality = isAudio ? 'best' : (quality || 'best');

    try {
      // 1. Check L1/L2 caches first
      const cacheKey = `extract:${url}:${resolvedQuality}`;
      const cached = cacheManager.get(cacheKey);
      
      if (cached) {
        return res.json({
          success: true,
          message: `${isAudio ? 'Audio' : 'Video'} links extracted successfully`,
          cached: true,
          data: { cached: true, ...cached }
        });
      }

      // 2. Queue the task to BullMQ
      const jobId = await jobQueue.addJob(url, resolvedQuality, { poToken, visitorData });
      
      res.status(202).json({
        success: true,
        message: `${isAudio ? 'Audio extraction' : 'Extraction'} task queued successfully`,
        jobId: jobId,
        status: 'waiting'
      });

    } catch (error) {
      console.error(`[API Router] ${isAudio ? 'Audio ' : ''}Extraction queueing failed for URL:`, url, error);
      res.status(500).json({
        success: false,
        error: `Failed to queue ${isAudio ? 'audio ' : ''}extraction task`,
        message: error.message
      });
    }
  }
);

/**
 * POST /api/extract/batch
 * Extracts metadata for multiple YouTube URLs concurrently.
 * Checks cache for each, enqueuing uncached entries.
 */
router.post(
  '/extract/batch',
  security.verifySignatureMiddleware(),
  validateBatchRequest,
  checkValidationResult,
  async (req, res) => {
    const { urls, quality } = req.body;
    console.log(`[API Router] Executing batch request of size: ${urls.length}`);

    // Map each target to its execution promise (returns cached data or jobId)
    const tasks = urls.map(async (url) => {
      try {
        const cacheKey = `extract:${url}:${quality || 'best'}`;
        const cached = cacheManager.get(cacheKey);

        if (cached) {
          return {
            url,
            success: true,
            cached: true,
            data: { cached: true, ...cached }
          };
        }

        // Add to queue
        const jobId = await jobQueue.addJob(url, quality);
        return {
          url,
          success: true,
          cached: false,
          jobId: jobId,
          status: 'waiting'
        };
      } catch (err) {
        return {
          url,
          success: false,
          error: err.message
        };
      }
    });

    // Execute concurrently (Promise.all resolves all items together)
    const results = await Promise.all(tasks);
    res.json({
      success: true,
      batchSize: urls.length,
      results
    });
  }
);

/**
 * POST /api/formats
 * Returns streamlined lists of available files and qualities.
 * Checks cache first, otherwise queues a background job.
 */
router.post(
  '/formats',
  security.verifySignatureMiddleware(),
  validateExtractionRequest,
  checkValidationResult,
  async (req, res) => {
    const { url, poToken, visitorData } = req.body;
    const cacheKey = `formats:${url}`;

    try {
      // 1. Fetch cached layout
      const cached = cacheManager.get(cacheKey);
      if (cached) {
        return res.json({ success: true, cached: true, formats: cached });
      }

      // Check if full extraction results are already cached
      const generalCacheKey = `extract:${url}:best`;
      const generalCached = cacheManager.get(generalCacheKey);
      if (generalCached) {
        const cleanFormats = ResponseOptimizer.stripToFormatsOnly(generalCached);
        cacheManager.set(cacheKey, cleanFormats, { ttl: 7200000 });
        return res.json({ success: true, cached: true, formats: cleanFormats });
      }

      // 2. Queue the task to BullMQ
      const jobId = await jobQueue.addJob(url, 'best', { poToken, visitorData });

      res.status(202).json({
        success: true,
        message: 'Format extraction task queued successfully',
        jobId: jobId,
        status: 'waiting'
      });

    } catch (error) {
      console.error('[API Router] Format listing queueing failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to queue format extraction task',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/extract/status/:jobId
 * Polls the extraction status of a background job.
 * Supports optional ?type=audio or ?type=formats query formatting.
 */
router.get('/extract/status/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const { type } = req.query; // 'audio' or 'formats'

  try {
    const job = await jobQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
        message: 'The requested extraction job does not exist or has expired.'
      });
    }

    const state = await job.getState();
    const progress = job.progress;

    if (state === 'completed') {
      const data = job.returnvalue || job.returnValue;

      if (!data) {
        return res.status(500).json({
          success: false,
          error: 'No data retrieved',
          message: 'The job completed but returned empty metadata.'
        });
      }

      // Apply type filters to format the output matching corresponding endpoints
      if (type === 'audio') {
        let audioFormats = data.formats.filter(f => f.hasAudio && !f.hasVideo);
        if (audioFormats.length === 0) audioFormats = data.formats.filter(f => f.hasAudio);
        if (audioFormats.length === 0) {
          return res.status(404).json({ success: false, error: 'No audio streams found for this video' });
        }

        const bestAudio = [...audioFormats].sort((a, b) => (b.audioBitrate || b.totalBitrate || 0) - (a.audioBitrate || a.totalBitrate || 0))[0];

        return res.json({
          success: true,
          jobId: job.id,
          status: state,
          progress: progress,
          data: {
            id: data.id,
            title: data.title,
            duration: data.duration,
            thumbnail: data.thumbnail,
            uploader: data.uploader,
            uploadDate: data.uploadDate,
            viewCount: data.viewCount,
            likeCount: data.likeCount,
            audioUrl: bestAudio.url || bestAudio.manifestUrl,
            audioBitrate: bestAudio.audioBitrate || bestAudio.totalBitrate,
            ext: bestAudio.ext,
            filesize: bestAudio.filesize || bestAudio.filesizeApprox,
            formats: audioFormats.map(f => ({
              formatId: f.formatId,
              ext: f.ext,
              bitrate: f.audioBitrate || f.totalBitrate,
              filesize: f.filesize || f.filesizeApprox,
              url: f.url || f.manifestUrl
            }))
          }
        });
      }

      if (type === 'formats') {
        const cleanFormats = ResponseOptimizer.stripToFormatsOnly(data);
        return res.json({
          success: true,
          jobId: job.id,
          status: state,
          progress: progress,
          formats: cleanFormats
        });
      }

      // Default: Return full metadata
      return res.json({
        success: true,
        jobId: job.id,
        status: state,
        progress: progress,
        data: data
      });
    }

    if (state === 'failed') {
      let statusCode = 500;
      let errorMessage = 'Failed to extract video links';
      const failedReason = job.failedReason || '';

      if (failedReason.includes('timeout')) {
        statusCode = 408;
        errorMessage = 'Network connection timed out. Please retry.';
      } else if (failedReason.includes('rate limit') || failedReason.includes('429')) {
        statusCode = 429;
        errorMessage = 'YouTube has temporarily rate limited this IP proxy. Retrying rotation.';
      } else if (failedReason.includes('not found') || failedReason.includes('unavailable') || failedReason.includes('404')) {
        statusCode = 404;
        errorMessage = 'Requested YouTube video was not found, or is age-restricted/unavailable.';
      }

      return res.status(statusCode).json({
        success: false,
        jobId: job.id,
        status: state,
        error: errorMessage,
        message: failedReason
      });
    }

    // Otherwise, still processing (active, waiting, etc.)
    return res.json({
      success: true,
      jobId: job.id,
      status: state,
      progress: progress
    });

  } catch (error) {
    console.error('[API Router] Job status check failed for Job ID:', jobId, error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve job status',
      message: error.message
    });
  }
});

/**
 * GET /api/stats
 * Secure diagnostics panel showing caches, RAM heap, worker, and BullMQ queue counts.
 */
router.get('/stats', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== config.adminApiKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized access',
      message: 'x-api-key header must contain valid admin security authorization credentials.'
    });
  }

  let bullmqQueueStats = null;
  try {
    bullmqQueueStats = await jobQueue.queue.getJobCounts();
  } catch (err) {
    // Fail-safe default
  }

  res.json({
    success: true,
    timestamp: Date.now(),
    uptimeSeconds: process.uptime(),
    memoryHeapUsage: process.memoryUsage(),
    cacheMetrics: cacheManager.getStats(),
    activeWorkersCount: config.extractor.maxWorkers || 4,
    activeJobsPending: extractionPool.activeJobs.size,
    queuedJobsWaiting: 0,
    bullmqQueueStats
  });
});

/**
 * GET /api/proxy
 * Optimized streaming proxy using native fetch to resolve CORS blockages on YouTube streams in the frontend.
 */
router.get('/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  try {
    const decodedUrl = decodeURIComponent(url);
    const parsedUrl = new URL(decodedUrl);
    
    // Safety check: ensure we only proxy trusted video content streams
    if (!parsedUrl.hostname.includes('googlevideo.com') && !parsedUrl.hostname.includes('youtube.com') && !parsedUrl.hostname.includes('ytimg.com')) {
      return res.status(403).json({ error: 'Forbidden domain' });
    }

    const response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.youtube.com/',
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Remote server responded with ${response.status}` });
    }

    // Forward the headers
    if (response.headers.get('content-type')) {
      res.setHeader('Content-Type', response.headers.get('content-type'));
    }
    if (response.headers.get('content-length')) {
      res.setHeader('Content-Length', response.headers.get('content-length'));
    }
    
    // Explicit CORS approval
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Streaming pipe using modern Node stream reader
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (error) {
    console.error('[API Proxy] Error forwarding media stream:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Proxy failed', message: error.message });
    }
  }
});

export default router;

