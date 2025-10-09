# Use Ubuntu 22.04 (works for both amd64 and arm64)
FROM ubuntu:22.04

# Set non-interactive mode to avoid prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install curl, gnupg, and other dependencies
RUN apt-get update -y && apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Add NodeSource repository for Node.js 23 (auto-detects architecture)
RUN curl -fsSL https://deb.nodesource.com/setup_23.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest

# Ensure Node.js is globally available in PATH
ENV PATH="/usr/bin:$PATH"

# Verify installation
RUN node -v && npm -v

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm fetch --prod && pnpm install --prod

# Copy the full application code
COPY . .

# Expose the port your Node.js app runs on (if needed)
EXPOSE 3000

# Set the default command
CMD ["node", "server.js"]
