# ──────────────────────────────────────────────────────────────────────────────
# FluxaPay Backend — Production Docker Image
#
# Multi-stage build:
#   Stage 1 (deps)    – install *all* npm dependencies (including devDeps needed
#                       for Prisma generate + tsc).
#   Stage 2 (builder) – compile TypeScript, generate Prisma client, copy
#                       native binaries into dist/.
#   Stage 3 (runner)  – minimal runtime image; only production node_modules and
#                       compiled JS; runs as a non-root user.
#
# Build args (all optional):
#   NODE_VERSION      – base Node.js version tag  (default: 20-alpine)
#   PORT              – port the app listens on    (default: 3000)
#
# Required runtime environment variables (pass via -e / docker-compose / k8s):
#   DATABASE_URL                   – PostgreSQL connection string
#   JWT_SECRET                     – JWT signing secret
#   FUNDER_SECRET_KEY              – Stellar funding wallet secret
#   MASTER_VAULT_SECRET_KEY        – Stellar master vault secret
#   USDC_ISSUER_PUBLIC_KEY         – USDC asset issuer address
#   KMS_ENCRYPTED_MASTER_SEED      – AES-encrypted HD wallet seed (or HD_WALLET_MASTER_SEED for plaintext dev use)
#
# Optional runtime environment variables (sensible defaults shown):
#   PORT                           – HTTP port (default: 3000)
#   NODE_ENV                       – node environment (default: production)
#   STELLAR_HORIZON_URL            – Horizon endpoint (default: testnet)
#   STELLAR_NETWORK_PASSPHRASE     – network passphrase
#   PAYMENT_MONITOR_INTERVAL_MS    – poll interval in ms (default: 120000)
#   DISABLE_CRON                   – set "true" to disable all cron jobs
#   SHUTDOWN_TIMEOUT_MS            – graceful shutdown timeout (default: 30000)
#   See .env.example for the full list.
#
# Kubernetes preStop / terminationGracePeriodSeconds guidance:
#   Set terminationGracePeriodSeconds to SHUTDOWN_TIMEOUT_MS/1000 + preStop
#   sleep, e.g. for a 30 s drain + 5 s preStop use 35 s:
#
#     spec:
#       terminationGracePeriodSeconds: 35
#       containers:
#         - lifecycle:
#             preStop:
#               exec:
#                 command: ["sleep", "5"]
# ──────────────────────────────────────────────────────────────────────────────

ARG NODE_VERSION=20-alpine

# ── Stage 1: install all dependencies ────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# Install everything (devDeps required for tsc + prisma generate)
RUN npm ci

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder

RUN apk add --no-cache openssl

WORKDIR /app

# Re-use installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma

COPY . .

# Generate Prisma client for the linux-musl (Alpine) target
RUN npx prisma generate

# Compile TypeScript
RUN npm run build

# Copy native Prisma query-engine binary into dist/ so Node can resolve it at
# runtime (tsc only emits .js; the .node binary must sit next to client.js).
RUN mkdir -p dist/generated/client && \
    cp src/generated/client/*.node dist/generated/client/ 2>/dev/null || true

# Prune devDependencies for the final image
RUN npm prune --omit=dev

# ── Stage 3: production runner ────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner

RUN apk add --no-cache curl

WORKDIR /app

# Create a non-root user and group
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy only what is needed to run the app
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json

# Switch to non-root user
USER appuser

ARG PORT=3000
ENV PORT=${PORT} \
    NODE_ENV=production

EXPOSE ${PORT}

# Health check — hits the /health endpoint every 30 s.
# start-period gives Prisma time to connect + run any pending migrations.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["node", "dist/index.js"]
