/**
 * Security and Cryptographic Utilities
 * 
 * Handles ephemeral token generation, signature validation, CORS origin verification,
 * and request integrity checks to secure the APIs against automated scraping
 * without needing user logins.
 */

import crypto from 'crypto';
import config from '../../config/default.js';

// Secure random secret key generated at server startup.
// Because it rotates on startup, attackers cannot forge tokens offline.
const SERVER_STARTUP_SECRET = crypto.randomBytes(32).toString('hex');

class SecurityManager {
  constructor() {
    this.clientSecretFormula = config.security.clientSecretFormula;
    this.tokenExpiryMs = config.security.tokenExpiryMs;
  }

  /**
   * Generates a short-lived cryptographically signed token for a client session.
   * Format: sessionId.createdAt.expiresAt.signature
   */
  generateAppToken() {
    const sessionId = crypto.randomBytes(16).toString('hex');
    const createdAt = Date.now();
    const expiresAt = createdAt + this.tokenExpiryMs;

    const payload = `${sessionId}.${createdAt}.${expiresAt}`;
    const signature = crypto
      .createHmac('sha256', SERVER_STARTUP_SECRET)
      .update(payload)
      .digest('hex');

    return `${payload}.${signature}`;
  }

  /**
   * Cryptographically verifies if the app token was issued by this server instance and is still valid.
   */
  verifyAppToken(token) {
    if (!token || typeof token !== 'string') return false;

    const parts = token.split('.');
    if (parts.length !== 4) return false;

    const [sessionId, createdAt, expiresAt, signature] = parts;
    const payload = `${sessionId}.${createdAt}.${expiresAt}`;

    // 1. Recalculate HMAC signature and verify
    const expectedSignature = crypto
      .createHmac('sha256', SERVER_STARTUP_SECRET)
      .update(payload)
      .digest('hex');

    const isValidSignature = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );

    if (!isValidSignature) {
      console.warn('[Security] Invalid token signature detected.');
      return false;
    }

    // 2. Verify token expiration
    const now = Date.now();
    if (now > parseInt(expiresAt, 10)) {
      console.warn('[Security] Client app token has expired.');
      return false;
    }

    return true;
  }

  /**
   * Verifies if a request signature matches the expected hash to prove integrity.
   * Signature is computed on frontend as: SHA256(token + timestamp + url + clientSecretFormula)
   */
  verifyRequestSignature(token, timestamp, url, signatureToVerify) {
    if (!token || !timestamp || !signatureToVerify) return false;

    // 1. Replay protection: Check if request timestamp is within a 30-second window
    const now = Date.now();
    const reqTime = parseInt(timestamp, 10);
    const timeDrift = Math.abs(now - reqTime);

    if (timeDrift > 30 * 1000) {
      console.warn(`[Security] Timestamp drift too large (${timeDrift / 1000}s). Rejecting for replay safety.`);
      return false;
    }

    // 2. Reconstruct expected signature
    const input = `${token}${timestamp}${url || ''}${this.clientSecretFormula}`;
    const expectedSignature = crypto
      .createHash('sha256')
      .update(input)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signatureToVerify, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (err) {
      return false;
    }
  }

  /**
   * Direct Express Middleware: Enforces secure handshake tokens and dynamic request signatures
   */
  verifySignatureMiddleware() {
    return (req, res, next) => {
      // Bypass security checks for local dev tools or stats with API keys if required
      const apiKey = req.headers['x-api-key'];
      if (apiKey && apiKey === config.adminApiKey) {
        return next();
      }

      const token = req.headers['x-app-token'];
      const timestamp = req.headers['x-app-timestamp'];
      const signature = req.headers['x-app-signature'];

      // Extract the url from request body or query parameter to verify payload consistency
      const url = req.body?.url || req.query?.url || '';

      // 1. Verify App Token
      if (!this.verifyAppToken(token)) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Invalid or expired client security token. Perform a new handshake.'
        });
      }

      // 2. Verify Request Signature (prevents scraping tools from just hardcoding a token)
      if (!this.verifyRequestSignature(token, timestamp, url, signature)) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Request signature validation failed. Origin is unauthorized.'
        });
      }

      next();
    };
  }

  /**
   * Basic request headers scanning to filter out simplistic scraping tools (cURL, Python, raw http clients)
   */
  isAuthenticBrowser(req) {
    const userAgent = req.headers['user-agent'] || '';
    
    // Simplistic bots filter
    const scraperKeywords = ['curl', 'python', 'postman', 'axios', 'wget', 'urllib', 'got-scraping'];
    const uaLower = userAgent.toLowerCase();
    
    if (scraperKeywords.some(keyword => uaLower.includes(keyword))) {
      return false;
    }

    // Modern browsers usually set Sec-Fetch headers. If not present in production, flag it.
    if (config.env === 'production') {
      const secFetchSite = req.headers['sec-fetch-site'];
      const secFetchMode = req.headers['sec-fetch-mode'];
      
      // If we are in production, standard browser requests to our API should have these fetch headers
      if (!secFetchSite || !secFetchMode) {
        // Warning log for telemetry, can block if strictness is turned up
        console.warn('[Security] Missing Sec-Fetch headers in production request.');
      }
    }

    return true;
  }
}

export default new SecurityManager();
