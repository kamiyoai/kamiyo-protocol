FROM node:20-alpine

# Install build dependencies, supervisor, and litestream
RUN apk add --no-cache python3 make g++ supervisor wget

# Install litestream for SQLite replication
ARG LITESTREAM_VERSION=0.3.13
RUN wget -qO- https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-amd64-static.tar.gz | tar xz -C /usr/local/bin

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create data directory
RUN mkdir -p /app/data

# Copy supervisor and litestream configs
COPY supervisord.conf /etc/supervisord.conf
COPY litestream.yml /app/litestream.yml
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Expose ports
EXPOSE 3000 3001

# Health check (checks actions API)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Run with entrypoint (handles litestream if configured)
ENTRYPOINT ["/app/entrypoint.sh"]
