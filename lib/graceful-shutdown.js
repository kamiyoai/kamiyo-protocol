/**
 * Graceful Shutdown Handler
 *
 * Handles SIGTERM and SIGINT to clean up resources before shutdown
 * Critical for serverless environments and zero-downtime deploys
 */

import prisma from './prisma.js';
import rateLimiter from './x402-saas/rate-limiter.js';

let isShuttingDown = false;

/**
 * Graceful shutdown procedure
 */
async function shutdown(signal) {
  if (isShuttingDown) {
    console.log('Shutdown already in progress...');
    return;
  }

  isShuttingDown = true;
  console.log(`\nReceived ${signal}, starting graceful shutdown...`);

  const shutdownTimeout = setTimeout(() => {
    console.error('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, 30000); // 30 second timeout

  try {
    // Close database connections
    console.log('Closing database connections...');
    await prisma.$disconnect();

    // Clean up rate limiter
    console.log('Cleaning up rate limiter...');
    rateLimiter.destroy();

    // Clear timeout and exit cleanly
    clearTimeout(shutdownTimeout);
    console.log('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

/**
 * Register shutdown handlers
 */
export function registerShutdownHandlers() {
  // Handle SIGTERM (Docker, Kubernetes, systemd)
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    shutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    shutdown('unhandledRejection');
  });

  console.log('Graceful shutdown handlers registered');
}

/**
 * Health check middleware - returns 503 when shutting down
 */
export function isHealthy(req, res, next) {
  if (isShuttingDown) {
    return res.status(503).json({
      error: 'Service shutting down',
      errorCode: 'SERVICE_UNAVAILABLE'
    });
  }
  next();
}
