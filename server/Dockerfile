# Ultra-Lean Production Dockerfile for yt-extractor-api
FROM node:18-alpine

# Install minimal runtime dependencies (python3 for yt-dlp, curl for healthchecks)
RUN apk add --no-cache python3 curl && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Create the application deployment directory
WORKDIR /usr/src/app

# Copy dependency specifications and lockfiles
COPY package*.json ./

# Install production Node dependencies and purge npm cache for minimum layer size
RUN npm ci --omit=dev && npm cache clean --force

# Install PM2 globally within container (Disabled for lightweight single-process free tier deployment)
# RUN npm install -g pm2

# Copy application codebase
COPY . .

# Security hardening & log dir permissions: Create non-root system user
RUN mkdir -p logs && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /usr/src/app

# Switch context to non-root user
USER nodejs

# Expose API traffic port
EXPOSE 3000

# Set environment defaults inside container
ENV NODE_ENV=production \
    PORT=3000 \
    YT_DLP_PATH=yt-dlp \
    REDIS_URL=redis://redis:6379 \
    ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:8080,http://127.0.0.1:3000,http://127.0.0.1:5173 \
    PO_TOKEN_SERVER_URL="https://bgutil-ytdlp-potoken-generator.onrender.com/token"

# Execute server using single Node.js process (Render 512MB free tier optimized)
# CMD ["pm2-runtime", "start", "ecosystem.config.cjs"]
CMD ["node", "src/server.js"]
