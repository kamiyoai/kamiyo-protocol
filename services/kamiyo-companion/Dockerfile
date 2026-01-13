FROM node:20-alpine

# Install build dependencies and supervisor
RUN apk add --no-cache python3 make g++ supervisor

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

# Copy supervisor config
COPY supervisord.conf /etc/supervisord.conf

# Expose ports
EXPOSE 3000 3001

# Health check (checks actions API)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Run with supervisor for proper process management
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
