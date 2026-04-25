# Payment Monitor Worker Deployment Guide

## Overview

The payment monitor worker runs as a separate process to monitor Stellar blockchain payments independently from the main API server. This allows for independent scaling and resource management.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Main API      │    │  Payment Monitor │    │   Stellar       │
│   Server        │◄──►│    Worker        │◄──►│   Horizon       │
│   (Port 3000)   │    │  (Separate Proc) │    │   Network       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Environment Configuration

### Required Environment Variables

```bash
# Enable/disable the payment monitor worker (default: true)
PAYMENT_MONITOR_WORKER_ENABLED=true

# Payment monitor polling interval in milliseconds (default: 120000 = 2 minutes)
PAYMENT_MONITOR_INTERVAL_MS=120000

# Worker graceful shutdown timeout in milliseconds (default: 5000 = 5 seconds)
WORKER_GRACEFUL_SHUTDOWN_TIMEOUT_MS=5000
```

### Shared Dependencies

The worker also requires these standard environment variables:

```bash
# Database
DATABASE_URL=postgresql://...

# Stellar Configuration
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
USDC_ISSUER_PUBLIC_KEY=GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y

# HD Wallet & KMS
KMS_PROVIDER=local
KMS_ENCRYPTION_PASSPHRASE=your-strong-passphrase
KMS_ENCRYPTED_MASTER_SEED=your-encrypted-seed
```

## Running the Worker

### Development

```bash
# Run with ts-node (development)
npm run worker:payment-monitor

# Run with auto-reload (development)
npm run worker:payment-monitor:dev
```

### Production

```bash
# Build the worker
npm run worker:payment-monitor:build

# Run the compiled worker
npm run worker:payment-monitor:start
```

## Deployment Options

### Option 1: Docker Compose (Recommended)

```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - PAYMENT_MONITOR_WORKER_ENABLED=false  # Disable in API server
    depends_on:
      - postgres

  payment-monitor-worker:
    build: .
    command: npm run worker:payment-monitor:start
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - PAYMENT_MONITOR_WORKER_ENABLED=true
      - PAYMENT_MONITOR_INTERVAL_MS=120000
    depends_on:
      - postgres
    restart: unless-stopped
```

### Option 2: Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-monitor-worker
spec:
  replicas: 1
  selector:
    matchLabels:
      app: payment-monitor-worker
  template:
    metadata:
      labels:
        app: payment-monitor-worker
    spec:
      containers:
      - name: worker
        image: fluxapay-backend:latest
        command: ["npm", "run", "worker:payment-monitor:start"]
        env:
        - name: PAYMENT_MONITOR_WORKER_ENABLED
          value: "true"
        - name: PAYMENT_MONITOR_INTERVAL_MS
          value: "120000"
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

### Option 3: Systemd Service

```ini
# /etc/systemd/system/fluxapay-payment-monitor.service
[Unit]
Description=FluxaPay Payment Monitor Worker
After=network.target

[Service]
Type=simple
User=fluxapay
WorkingDirectory=/opt/fluxapay-backend
Environment=NODE_ENV=production
Environment=PAYMENT_MONITOR_WORKER_ENABLED=true
ExecStart=/usr/bin/npm run worker:payment-monitor:start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable fluxapay-payment-monitor
sudo systemctl start fluxapay-payment-monitor
```

## Scaling Considerations

### Horizontal Scaling

- **Multiple Workers**: Run multiple instances with different polling intervals
- **Load Balancing**: Use database-level locking to prevent duplicate processing
- **Resource Isolation**: Each worker has its own memory and CPU allocation

### Vertical Scaling

- **Memory**: Monitor memory usage with payment volume
- **CPU**: Increase CPU for high-frequency polling
- **Database Connections**: Consider connection pooling for multiple workers

## Monitoring

### Health Checks

The worker exposes process health through logs:

```bash
# Check worker logs
docker logs payment-monitor-worker

# Look for these indicators:
# [PaymentMonitorWorker] Starting payment monitor worker...
# [PaymentMonitorWorker] Payment monitor worker started successfully
```

### Metrics to Monitor

1. **Payment Processing Rate**: Payments processed per minute
2. **Error Rate**: Failed Horizon API calls
3. **Database Performance**: Query execution times
4. **Memory Usage**: Worker process memory consumption
5. **Stellar API Rate Limits**: Horizon throttling

### Alerting

Set up alerts for:
- Worker process crashes
- High error rates (>5%)
- Missed polling intervals
- Database connection failures

## Troubleshooting

### Common Issues

1. **Worker Not Starting**
   ```bash
   # Check if enabled
   echo $PAYMENT_MONITOR_WORKER_ENABLED
   
   # Check environment variables
   npm run worker:payment-monitor
   ```

2. **Database Connection Issues**
   ```bash
   # Test database connectivity
   npx prisma db pull
   ```

3. **Stellar Horizon API Issues**
   ```bash
   # Test Horizon connectivity
   curl $STELLAR_HORIZON_URL
   ```

### Debug Mode

Enable additional logging:

```bash
# Set log level
DEBUG=payment-monitor:* npm run worker:payment-monitor
```

## Security Considerations

1. **Environment Variables**: Store sensitive data in secret management
2. **Network Access**: Limit worker's network access to required services only
3. **Process Isolation**: Run worker with minimal privileges
4. **Database Access**: Use read-only database user where possible

## Migration from Integrated Monitor

If migrating from the integrated payment monitor:

1. **Disable Integrated Monitor**:
   ```bash
   PAYMENT_MONITOR_WORKER_ENABLED=false
   ```

2. **Deploy Worker**:
   ```bash
   npm run worker:payment-monitor:start
   ```

3. **Verify Functionality**:
   - Check that payments are still being processed
   - Monitor for duplicate processing
   - Validate webhook delivery

4. **Decommission Old Code** (after verification):
   - Remove integrated monitor from main server
   - Clean up unused cron jobs

## Performance Tuning

### Polling Interval Optimization

- **High Volume**: 30-60 seconds
- **Normal Volume**: 2 minutes (default)
- **Low Volume**: 5 minutes

### Database Optimization

```sql
-- Add indexes for performance
CREATE INDEX CONCURRENTLY "Payment_status_stellar_address_idx" 
ON "Payment"("status", "stellar_address") 
WHERE "status" IN ('pending', 'partially_paid');
```

### Connection Pooling

```javascript
// In worker, use connection pooling
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Limit connections for worker
  __internal: {
    engine: {
      connectionLimit: 5,
    },
  },
});
```
