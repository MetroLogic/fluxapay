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

// Load environment variables
dotenv.config();

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
  console.log(`[PaymentMonitorWorker] Received ${signal}, initiating graceful shutdown...`);
  
  try {
    // Stop the payment monitor
    stopPaymentMonitor();
    
    // Wait for graceful shutdown timeout
    await new Promise(resolve => setTimeout(resolve, WORKER_CONFIG.gracefulShutdownTimeout));
    
    console.log('[PaymentMonitorWorker] Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('[PaymentMonitorWorker] Error during graceful shutdown:', error);
    process.exit(1);
  }
}

/**
 * Main worker function
 */
async function main() {
  console.log('[PaymentMonitorWorker] Starting payment monitor worker...');
  console.log('[PaymentMonitorWorker] Configuration:', {
    enabled: WORKER_CONFIG.enabled,
    intervalMs: WORKER_CONFIG.intervalMs,
    gracefulShutdownTimeout: WORKER_CONFIG.gracefulShutdownTimeout,
  });

  if (!WORKER_CONFIG.enabled) {
    console.log('[PaymentMonitorWorker] Worker disabled via PAYMENT_MONITOR_WORKER_ENABLED=false');
    process.exit(0);
  }

  // Set up graceful shutdown handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('[PaymentMonitorWorker] Uncaught exception:', error);
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[PaymentMonitorWorker] Unhandled rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
  });

  try {
    // Start the payment monitor
    startPaymentMonitor();
    
    console.log('[PaymentMonitorWorker] Payment monitor worker started successfully');
    
    // Keep the process alive
    // The worker will run indefinitely until stopped
  } catch (error) {
    console.error('[PaymentMonitorWorker] Failed to start payment monitor:', error);
    process.exit(1);
  }
}

// Run the worker
if (require.main === module) {
  main().catch((error) => {
    console.error('[PaymentMonitorWorker] Worker failed to start:', error);
    process.exit(1);
  });
}

export { main as startPaymentMonitorWorker };
