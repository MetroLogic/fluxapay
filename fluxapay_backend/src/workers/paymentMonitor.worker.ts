#!/usr/bin/env node

/**
 * Payment Monitor Worker
 * 
 * Runs as a separate process to monitor Stellar payments independently
 * from the main API server. This allows for independent scaling and
 * resource management.
 */

import dotenv from 'dotenv';
import { startPaymentMonitor, stopPaymentMonitor } from '../services/paymentMonitor.service';
import { getLogger } from '../utils/logger';

// Load environment variables
dotenv.config();

const logger = getLogger();

/**
 * Worker configuration from environment variables
 */
const WORKER_CONFIG = {
  enabled: process.env.PAYMENT_MONITOR_WORKER_ENABLED !== 'false',
  intervalMs: parseInt(process.env.PAYMENT_MONITOR_INTERVAL_MS || '120000', 10),
  gracefulShutdownTimeout: parseInt(process.env.WORKER_GRACEFUL_SHUTDOWN_TIMEOUT_MS || '5000', 10),
};

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, initiating graceful shutdown...`);
  
  try {
    // Stop the payment monitor
    stopPaymentMonitor();
    
    // Wait for graceful shutdown timeout
    await new Promise(resolve => setTimeout(resolve, WORKER_CONFIG.gracefulShutdownTimeout));
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error: any) {
    logger.error('Error during graceful shutdown', { error: error.message });
    process.exit(1);
  }
}

/**
 * Main worker function
 */
async function main() {
  logger.info('Starting payment monitor worker...');
  logger.info('Configuration', {
    enabled: WORKER_CONFIG.enabled,
    intervalMs: WORKER_CONFIG.intervalMs,
    gracefulShutdownTimeout: WORKER_CONFIG.gracefulShutdownTimeout,
  });

  if (!WORKER_CONFIG.enabled) {
    logger.info('Worker disabled via PAYMENT_MONITOR_WORKER_ENABLED=false');
    process.exit(0);
  }

  // Set up graceful shutdown handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled rejection', { reason });
    gracefulShutdown('unhandledRejection');
  });

  try {
    // Start the payment monitor
    startPaymentMonitor();
    
    logger.info('Payment monitor worker started successfully');
    
    // Keep the process alive
    // The worker will run indefinitely until stopped
  } catch (error: any) {
    logger.error('Failed to start payment monitor', { error: error.message });
    process.exit(1);
  }
}

// Run the worker
if (require.main === module) {
  main().catch((error: any) => {
    logger.error('Worker failed to start', { error: error.message });
    process.exit(1);
  });
}

export { main as startPaymentMonitorWorker };
