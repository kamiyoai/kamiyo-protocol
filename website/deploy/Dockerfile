# Multi-stage Dockerfile for Kamiyo Social Media Posting Module
# Production-ready with security best practices

# Build stage - install dependencies
FROM python:3.11-slim as builder

# Set working directory
WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies to a specific directory
RUN pip install --no-cache-dir --user -r requirements.txt

# Runtime stage - minimal production image
FROM python:3.11-slim

# Set labels
LABEL maintainer="Kamiyo Team <support@kamiyo.ai>"
LABEL description="Kamiyo Social Media Posting Module"
LABEL version="1.0.0"

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH=/home/kamiyo/.local/bin:$PATH \
    APP_HOME=/app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -r kamiyo && \
    useradd -r -g kamiyo -d /home/kamiyo -s /sbin/nologin -c "Kamiyo service user" kamiyo && \
    mkdir -p /home/kamiyo/.local /app/logs && \
    chown -R kamiyo:kamiyo /home/kamiyo /app

# Copy Python dependencies from builder
COPY --from=builder --chown=kamiyo:kamiyo /root/.local /home/kamiyo/.local

# Set working directory
WORKDIR $APP_HOME

# Copy application code
COPY --chown=kamiyo:kamiyo social/ ./social/
COPY --chown=kamiyo:kamiyo requirements.txt ./

# Create necessary directories
RUN mkdir -p logs data && chown -R kamiyo:kamiyo logs data

# Switch to non-root user
USER kamiyo

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Expose port for health check endpoint
EXPOSE 8000

# Default command - can be overridden by docker-compose
CMD ["python", "-m", "uvicorn", "social.health:app", "--host", "0.0.0.0", "--port", "8000", "&", "python", "-m", "social.kamiyo_watcher"]
