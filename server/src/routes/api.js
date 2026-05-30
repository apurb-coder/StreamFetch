/**
 * Express REST API Routes definition
 * 
 * Mounts standard endpoint targets:
 *  - POST /api/extract         : Extracts download urls for a single video (cached)
 *  - POST /api/extract/batch   : Extracts download links for multiple videos concurrently
 *  - POST /api/formats         : Retreives clean metadata format specs
 *  - GET  /api/stats           : System stats diagnostic telemetry (protected)
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
 * Helper: Processes extraction query for a single URL (checks cache first, falls back to extraction engine)
 */
async function processSingleUrl(url, quality) {
  const cacheKey = `extract:${url}:${quality || 'best'}`;

  // 1. Check L1/L2 caches
  const cached = cacheManager.get(cacheKey);
  if (cached) {
    return { cached: true, ...cached };
  }

  // 2. Perform fresh extraction racing against timeout limits
  const freshResult = await Promise.race([
    extractionPool.extract(url, { quality }),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Extraction request timeout')), 28000)
    )
  ]);

  // 3. Save to cache pool (shorter TTL for common videos, longer TTL for popular hits)
  const ttl = freshResult.viewCount > 1000000 ? 10800000 : 3600000; // 3 hours vs 1 hour
  cacheManager.set(cacheKey, freshResult, { ttl, hot: freshResult.viewCount > 1000000 });

  return { cached: false, ...freshResult };
}

/**
 * POST /api/extract
 * Extracts direct stream links for a single YouTube URL.
 */
router.post(
  '/extract',
  security.verifySignatureMiddleware(),
  validateExtractionRequest,
  checkValidationResult,
  async (req, res) => {
    const { url, quality } = req.body;

    try {
      const data = await processSingleUrl(url, quality);
      
      res.json({
        success: true,
        message: 'Video links extracted successfully',
        cached: data.cached,
        data: data
      });

    } catch (error) {
      console.error('[API Router] Extraction failed for URL:', url, error);

      // Determine clean error responses based on sub-process signals
      let statusCode = 500;
      let errorMessage = 'Failed to extract video links';

      if (error.message.includes('timeout')) {
        statusCode = 408;
        errorMessage = 'Network connection timed out. Please retry.';
      } else if (error.message.includes('rate limit') || error.message.includes('429')) {
        statusCode = 429;
        errorMessage = 'YouTube has temporarily rate limited this IP proxy. Retrying rotation.';
      } else if (error.message.includes('not found') || error.message.includes('unavailable') || error.message.includes('404')) {
        statusCode = 404;
        errorMessage = 'Requested YouTube video was not found, or is age-restricted/unavailable.';
      }

      res.status(statusCode).json({
        success: false,
        error: errorMessage,
        message: error.message
      });
    }
  }
);

/**
 * POST /api/extract/batch
 * Extracts metadata for multiple YouTube URLs concurrently (maximum 10).
 */
router.post(
  '/extract/batch',
  security.verifySignatureMiddleware(),
  validateBatchRequest,
  checkValidationResult,
  async (req, res) => {
    const { urls, quality } = req.body;
    console.log(`[API Router] Executing batch request of size: ${urls.length}`);

    // Map each target to its execution promise
    const tasks = urls.map(async (url) => {
      try {
        const item = await processSingleUrl(url, quality);
        return {
          url,
          success: true,
          data: item
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

      // 2. Fetch full metadata
      const rawMetadata = await extractionPool.extract(url);
      const cleanFormats = ResponseOptimizer.stripToFormatsOnly(rawMetadata);

      // 3. Cache stripped down format structure (TTL: 2 Hours)
      cacheManager.set(cacheKey, cleanFormats, { ttl: 7200000 });

      res.json({
        success: true,
        cached: false,
        formats: cleanFormats
      });

    } catch (error) {
      console.error('[API Router] Format listing failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve available video formats',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/stats
 * Secure diagnostics panel showing caches, RAM heap, and worker status.
 */
router.get('/stats', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const config = require('../../config/default');

  if (!apiKey || apiKey !== config.adminApiKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized access',
      message: 'x-api-key header must contain valid admin security authorization credentials.'
    });
  }

  res.json({
    success: true,
    timestamp: Date.now(),
    uptimeSeconds: process.uptime(),
    memoryHeapUsage: process.memoryUsage(),
    cacheMetrics: cacheManager.getStats(),
    activeWorkersCount: extractionPool.workers.length,
    activeJobsPending: extractionPool.activeJobs.size,
    queuedJobsWaiting: extractionPool.queue.length
  });
});

module.exports = router;
