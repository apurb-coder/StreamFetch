/**
 * Centralized Application Configurations
 * 
 * This module safely processes environment variables with fallback defaults
 * to configure caches, timeouts, proxy keys, and queue thresholds.
 */

import dotenv from 'dotenv';
dotenv.config(); // Load local .env file

export default {
  // Runtime environment configurations
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  
  // Security metrics
  adminApiKey: process.env.ADMIN_API_KEY || 'default_dev_key',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://localhost:8080,http://127.0.0.1:3000,http://127.0.0.1:5173').split(','),
  security: {
    clientSecretFormula: process.env.CLIENT_SECRET_FORMULA || 'yt2mp3_dynamic_secure_formula_salt_2026',
    tokenExpiryMs: parseInt(process.env.TOKEN_EXPIRY_MS || '900000', 10) // 15 mins default
  },

  // Redis configurations
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    maxRetries: 10,
    connectTimeout: 10000
  },

  // Worker & yt-dlp configurations
  extractor: {
    maxWorkers: parseInt(process.env.MAX_WORKERS || '4', 10),
    timeoutMs: parseInt(process.env.EXTRACTION_TIMEOUT || '25000', 10),
    binaryPath: process.env.YT_DLP_PATH || 'yt-dlp'
  },

  // Rate Limiting Configurations (Token-Bucket details)
  rateLimits: {
    global: {
      points: 10,       // 10 requests allowed globally
      duration: 1,      // per 1 second
      blockDuration: 30 // Block for 30 seconds if limit hit
    },
    ip: {
      points: 5,        // 5 requests allowed
      duration: 1,      // per 1 second
      blockDuration: 60 // Block for 60 seconds if limit hit
    },
    user: {
      points: 30,       // 30 requests allowed
      duration: 60,     // per 60 seconds (1 minute)
      blockDuration: 120 // Block for 120 seconds if limit hit
    }
  },

  // Proxy flags
  proxies: {
    useTor: process.env.USE_TOR === 'true',
    webshare: process.env.WEBSHARE_PROXIES ? process.env.WEBSHARE_PROXIES.split(',') : [],
    oracle: process.env.ORACLE_PROXIES ? process.env.ORACLE_PROXIES.split(',') : []
  }
};
