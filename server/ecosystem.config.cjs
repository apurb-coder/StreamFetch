/**
 * PM2 Clustered Process Runner Configuration
 * Use this to scale the Express API horizontally across multiple cores.
 * 
 * Command to run:
 *   pm2 start ecosystem.config.cjs
 */

module.exports = {
  apps: [{
    name: 'yt-extractor-api',
    script: './src/server.js',
    
    // Clustering setup
    instances: 'max',           // Fork an instance for every CPU core
    exec_mode: 'cluster',       // Run in cluster mode (load-balanced)
    
    // Performance and health
    watch: false,               // Do not watch files for auto-reloading in production
    max_memory_restart: '512M',  // Restart process if it exceeds 512MB RAM (failsafe)
    
    // Logging directories
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,                 // Add timestamps to all logs
    
    // Environment configurations
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      YT_DLP_PATH: 'yt-dlp',
      REDIS_URL: 'redis://localhost:6379',
      MAX_WORKERS: 4,
      USE_TOR: 'false'
    }
  }]
};
