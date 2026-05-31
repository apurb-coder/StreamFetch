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

const express = require('express');
const router = express.Router();

const extractionPool = require('../core/extractor');
const cacheManager = require('../core/cacheManager');
const rateLimiter = require('../queue/rateLimiter');
const ResponseOptimizer = require('../utils/optimizer');
const security = require('../core/security');
const jobQueue = require('../queue/jobQueue');
const { 
  validateExtractionRequest, 
  validateBatchRequest, 
  checkValidationResult 
} = require('../utils/validator');

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
 * POST /api/extract
 * Extracts direct stream links for a single YouTube URL.
 * Checks cache first, otherwise queues a background job.
 */
router.post(
  '/extract',
  security.verifySignatureMiddleware(),
  validateExtractionRequest,
  checkValidationResult,
  async (req, res) => {
    const { url, quality } = req.body;

    try {
      // 1. Check L1/L2 caches first
      const cacheKey = `extract:${url}:${quality || 'best'}`;
      const cached = cacheManager.get(cacheKey);
      
      if (cached) {
        return res.json({
          success: true,
          message: 'Video links extracted successfully',
          cached: true,
          data: { cached: true, ...cached }
        });
      }

      // 2. Queue the task to BullMQ
      const jobId = await jobQueue.addJob(url, quality);
      
      res.status(202).json({
        success: true,
        message: 'Extraction task queued successfully',
        jobId: jobId,
        status: 'waiting'
      });

    } catch (error) {
      console.error('[API Router] Extraction queueing failed for URL:', url, error);
      res.status(500).json({
        success: false,
        error: 'Failed to queue extraction task',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/extract/audio
 * Extracts only the audio stream links and metadata for a YouTube URL.
 * Checks cache first, otherwise queues a background job.
 */
router.post(
  '/extract/audio',
  security.verifySignatureMiddleware(),
  validateExtractionRequest,
  checkValidationResult,
  async (req, res) => {
    const { url } = req.body;

    try {
      // 1. Check L1/L2 caches first
      const cacheKey = `extract:${url}:best`;
      const cached = cacheManager.get(cacheKey);

      if (cached) {
        // Filter for formats that have audio but no video
        let audioFormats = cached.formats.filter(f => f.hasAudio && !f.hasVideo);

        // Fallback if no audio-only formats exist (e.g. video files with audio tracks)
        if (audioFormats.length === 0) {
          audioFormats = cached.formats.filter(f => f.hasAudio);
        }

        if (audioFormats.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'No audio streams found for this video'
          });
        }

        // Sort formats by bitrate descending
        const sortedAudioFormats = [...audioFormats].sort((a, b) => {
          const bitrateA = a.audioBitrate || a.totalBitrate || 0;
          const bitrateB = b.audioBitrate || b.totalBitrate || 0;
          return bitrateB - bitrateA;
        });

        const bestAudio = sortedAudioFormats[0];

        return res.json({
          success: true,
          message: 'Audio links extracted successfully',
          cached: true,
          data: {
            id: cached.id,
            title: cached.title,
            duration: cached.duration,
            thumbnail: cached.thumbnail,
            uploader: cached.uploader,
            uploadDate: cached.uploadDate,
            viewCount: cached.viewCount,
            likeCount: cached.likeCount,
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

      // 2. Queue the task to BullMQ (audio relies on full format collection)
      const jobId = await jobQueue.addJob(url, 'best');
      
      res.status(202).json({
        success: true,
        message: 'Audio extraction task queued successfully',
        jobId: jobId,
        status: 'waiting'
      });

    } catch (error) {
      console.error('[API Router] Audio extraction queueing failed for URL:', url, error);
      res.status(500).json({
        success: false,
        error: 'Failed to queue audio extraction task',
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
    const { url } = req.body;
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
      const jobId = await jobQueue.addJob(url, 'best');

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

        if (audioFormats.length === 0) {
          audioFormats = data.formats.filter(f => f.hasAudio);
        }

        if (audioFormats.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'No audio streams found for this video'
          });
        }

        const sortedAudioFormats = [...audioFormats].sort((a, b) => {
          const bitrateA = a.audioBitrate || a.totalBitrate || 0;
          const bitrateB = b.audioBitrate || b.totalBitrate || 0;
          return bitrateB - bitrateA;
        });

        const bestAudio = sortedAudioFormats[0];

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
  const config = require('../../config/default');

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
    activeWorkersCount: extractionPool.workers.length,
    activeJobsPending: extractionPool.activeJobs.size,
    queuedJobsWaiting: extractionPool.queue.length,
    bullmqQueueStats
  });
});

module.exports = router;
