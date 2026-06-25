/**
 * paymentMonitor.streaming.minimal.ts
 * 
 * Ultra-minimal working reference for SSE-based payment monitoring.
 * Add types and integrations as needed for your environment.
 */

interface PaymentStreamConfig {
  paymentId: string;
  address: string;
  horizonServer: any;
}

interface StreamStatus {
  paymentId: string;
  isActive: boolean;
  isHealthy: boolean;
  lastHeartbeat: Date;
}

/**
 * Simple stream handler for one payment
 */
function createPaymentStream(config: PaymentStreamConfig) {
  let closeStream: (() => void) | null = null;
  let lastHeartbeat = new Date();
  let reconnectBackoff = 1000; // ms
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  const maxBackoff = 300000; // 5 min
  const heartbeatTimeout = 30000; // 30 sec
  let isActive = true;
  let heartbeatTimer: any = null;
  const processedTxes = new Set<string>();

  const connect = () => {
    console.log(`[Stream] Connecting ${config.paymentId}...`);
    try {
      // stellar-sdk v14+ streaming support
      closeStream = config.horizonServer
        .payments()
        .forAccount(config.address)
        .stream({
          onmessage: (msg: any) => {
            lastHeartbeat = new Date();
            // TODO: Handle payment event
            // - Check if USDC payment
            // - Deduplicate
            // - Update DB
            // - Emit event
          },
          onerror: (err: any) => {
            console.error(`[Stream] Error: ${err}`);
            scheduleReconnect();
          },
        });
      
      reconnectAttempts = 0;
      reconnectBackoff = 1000;
      console.log(`[Stream] Connected ${config.paymentId}`);
      startHeartbeat();
    } catch (error) {
      console.error(`[Stream] Connection failed: ${error}`);
      scheduleReconnect();
    }
  };

  const startHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - lastHeartbeat.getTime();
      if (elapsed > heartbeatTimeout) {
        console.warn(`[Stream] Heartbeat timeout for ${config.paymentId}`);
        if (closeStream) closeStream();
        scheduleReconnect();
      }
    }, heartbeatTimeout / 2);
  };

  const scheduleReconnect = () => {
    reconnectAttempts++;
    if (reconnectAttempts > maxReconnectAttempts) {
      console.error(
        `[Stream] Max reconnects exceeded for ${config.paymentId}`
      );
      isActive = false;
      return;
    }

    const backoff = Math.min(
      reconnectBackoff * Math.pow(2, reconnectAttempts - 1),
      maxBackoff
    );

    console.log(
      `[Stream] Reconnecting in ${backoff}ms (attempt ${reconnectAttempts})`
    );

    setTimeout(() => {
      if (isActive) connect();
    }, backoff);
  };

  const close = () => {
    if (closeStream) closeStream();
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    isActive = false;
    console.log(`[Stream] Closed ${config.paymentId}`);
  };

  const getStatus = (): StreamStatus => ({
    paymentId: config.paymentId,
    isActive,
    isHealthy: Date.now() - lastHeartbeat.getTime() < heartbeatTimeout,
    lastHeartbeat,
  });

  return { connect, close, getStatus };
}

/**
 * Stream manager for all active payments
 */
const streamManager = (() => {
  const streams = new Map<string, any>();
  let fallbackPollTimer: any = null;

  const start = (payments: Array<{ id: string; stellar_address: string }>, horizonServer: any) => {
    console.log(`[StreamManager] Starting ${payments.length} streams...`);

    for (const payment of payments) {
      const stream = createPaymentStream({
        paymentId: payment.id,
        address: payment.stellar_address,
        horizonServer,
      });
      streams.set(payment.id, stream);
      stream.connect();
    }

    // Fallback polling every 5 min
    fallbackPollTimer = setInterval(() => {
      console.log(`[StreamManager] Health check: ${streams.size} streams`);
      // TODO: Check for dead streams, expired payments
    }, 300000);
  };

  const stop = () => {
    console.log(`[StreamManager] Stopping ${streams.size} streams...`);
    for (const stream of streams.values()) {
      stream.close();
    }
    streams.clear();
    if (fallbackPollTimer) clearInterval(fallbackPollTimer);
  };

  const getStatus = () => ({
    total: streams.size,
    healthy: Array.from(streams.values()).filter((s) => s.getStatus().isHealthy).length,
  });

  return { start, stop, getStatus };
})();

export { streamManager };
