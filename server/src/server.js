/**
 * Clustered Express REST API - Server Entrypoint
 * 
 * Sets up the primary web application instance. It includes:
 *  - Multiprocess Clustering: Spawns worker nodes across all CPU cores for production
 *  - Security Shielding: Mounts `helmet` middleware headers to block clickjacking/XSS
 *  - Response Compression: Brotli/Gzip compression on all API payloads
 *  - Health Telemetry: Serves clean `/health` connection status checkups
 *  - Routing: Mounts all validated endpoints at `/api`
 */

const express = require('express');
const cluster = require('cluster');
const os = require('os');
const helmet = require('helmet');
const compression = require('compression');
const config = require('../config/default');

// Multiprocess cluster setup for high-concurrency bare node environments
if (cluster.isMaster && config.env === 'production' && !process.env.PM2_USAGE) {
  const numCPUs = os.cpus().length;
  console.log(`[Master Server] Scaling core process. Spawning ${numCPUs} clusters...`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`[Master Server] Worker cluster ${worker.process.pid} died. Respawning...`);
    cluster.fork();
  });
} else {
  // Worker process setup (or single thread development server)
  const app = express();

  // 1. Mount security hardening headers (Helmet)
  app.use(helmet({
    contentSecurityPolicy: false, // Bypass if hosting simple swagger/dashboards
    crossOriginEmbedderPolicy: false
  }));

  // 2. Enable payload compression (gzip, deflate, brotli if client supports it)
  app.use(compression({
    level: 6, // Optimized ratio between CPU usage and compression gains
    threshold: 1024 // Only compress payloads larger than 1KB
  }));

  // 3. Mount JSON parsing body-limit guards to protect memory
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // CORS Middleware - Strictly limit access to trusted origins
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = config.allowedOrigins || [];

    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (config.env === 'development' || !origin) {
      // Allow development environments or non-browser/same-origin requests gracefully
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-app-token, x-app-signature, x-app-timestamp');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // 4. Connect REST API routing
  const apiRouter = require('./routes/api');
  app.use('/api', apiRouter);

  // 5. Mount BullMQ Queue Dashboard placeholder (Optional)
  // To use this, add '@bull-board/express' and '@bull-board/api' to package dependencies.
  app.use('/admin/queues', (req, res) => {
    res.status(200).send('BullMQ Monitoring Dashboard Placeholder. Install @bull-board dependencies to activate.');
  });

  // 6. Root Landing Endpoint
  app.get('/', (req, res) => {
    res.json({
      success: true,
      message: 'YouTube Link Extractor REST API is online.'
    });
  });

  // 7. System Health check endpoint
  app.get('/health', (req, res) => {
    let redisStatus = 'disconnected';
    try {
      const rateLimiter = require('./queue/rateLimiter');
      redisStatus = rateLimiter.isRedisConnected ? 'connected' : 'disconnected';
    } catch (err) {
      // Fail-safe default
    }

    res.json({
      status: 'ok',
      timestamp: Date.now(),
      uptimeSeconds: process.uptime(),
      workerId: cluster.worker ? cluster.worker.id : 'master/dev',
      clusterPid: process.pid,
      environment: config.env,
      connections: {
        redis: redisStatus
      }
    });
  });

  // 8. Failsafe 404 Route handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      message: 'The requested API route path does not exist on this server.'
    });
  });

  // 9. Startup Listener
  const PORT = config.port || 3000;
  const server = app.listen(PORT, () => {
    console.log(`[Worker Process ${process.pid}] Listening for connections on port: ${PORT} (Env: ${config.env})`);
  });

  // 10. Graceful shutdown handler
  process.on('SIGTERM', () => {
    console.log('[Server Shutdown] SIGTERM received. Gracefully closing active network sockets...');
    server.close(async () => {
      console.log('[Server Shutdown] Network socket connections closed. Exiting.');
      
      // Clean pool worker threads and Redis streams
      try {
        const extractionPool = require('./core/extractor');
        const jobProcessor = require('./queue/jobProcessor');
        
        await extractionPool.shutdown();
        await jobProcessor.shutdown();
      } catch (err) {
        // Core items might not be loaded in simple boots
      }
      
      process.exit(0);
    });
  });
}
