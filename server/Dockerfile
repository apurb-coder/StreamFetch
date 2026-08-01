# Multi-Stage Production Dockerfile for High Performance yt-extractor-api
FROM node:18-alpine

# Install system dependencies (yt-dlp requires python, curl for healthchecks)
RUN apk add --no-cache \
    python3 \
    py3-pip \
    curl \
    wget

# Install yt-dlp globally using python pip
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp || pip3 install --no-cache-dir yt-dlp

# Create the application deployment directory
WORKDIR /usr/src/app

# Copy dependency specifications and lockfiles
COPY package*.json ./

# Install Node dependencies (production only, bypassing heavy dev tools like nodemon)
RUN npm ci --only=production

# Install PM2 globally within the container (Disabled for lightweight single-process free tier deployment)
# RUN npm install -g pm2

# Copy the rest of the application codebase (src, workers, config)
COPY . .

# Create log directories and give correct permissions
RUN mkdir -p logs && chmod -R 777 logs

# Security hardening: Create and run as a non-root system user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /usr/src/app

# Switch executing context to our non-root user
USER nodejs

# Expose API traffic port
EXPOSE 3000

# Set environment defaults inside container
ENV NODE_ENV=production
ENV PORT=3000
ENV YT_DLP_PATH=yt-dlp
ENV REDIS_URL=redis://redis:6379
ENV ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:8080,http://127.0.0.1:3000,http://127.0.0.1:5173

# Execute server using single Node.js process (Render 512MB free tier optimized)
# CMD ["pm2-runtime", "start", "ecosystem.config.cjs"]
CMD ["node", "src/server.js"]
