#!/bin/bash

# Payment Inheritance Plan - Implementation Verification Script
# This script verifies that all changes are working correctly

set -e  # Exit on any error

echo "=========================================="
echo "Payment Inheritance Plan Verification"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: package.json not found. Please run this script from the fluxapay_backend directory.${NC}"
    exit 1
fi

echo "Step 1: Checking environment variables..."
if [ -z "$HD_WALLET_MASTER_SEED" ]; then
    echo -e "${YELLOW}Warning: HD_WALLET_MASTER_SEED is not set${NC}"
    echo "This is required for payment creation to work."
else
    echo -e "${GREEN}✓ HD_WALLET_MASTER_SEED is set${NC}"
fi
echo ""

echo "Step 2: Installing dependencies..."
npm ci > /dev/null 2>&1
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

echo "Step 3: Generating Prisma client..."
npm run prisma:generate > /dev/null 2>&1
echo -e "${GREEN}✓ Prisma client generated${NC}"
echo ""

echo "Step 4: Running lint check..."
if npm run lint > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Lint check passed (warnings are OK)${NC}"
else
    # Check if it's just warnings
    if npm run lint 2>&1 | grep -q "✖.*0 errors"; then
        echo -e "${GREEN}✓ Lint check passed (warnings only)${NC}"
    else
        echo -e "${RED}✗ Lint check failed${NC}"
        exit 1
    fi
fi
echo ""

echo "Step 5: Running TypeScript build..."
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Build successful${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi
echo ""

echo "Step 6: Running tests..."
if npm test > /dev/null 2>&1; then
    echo -e "${GREEN}✓ All tests passed${NC}"
    npm test 2>&1 | grep "Test Suites:" | head -1
    npm test 2>&1 | grep "Tests:" | head -1
else
    echo -e "${RED}✗ Tests failed${NC}"
    exit 1
fi
echo ""

echo "Step 7: Verifying file changes..."
files=(
    "prisma/schema.prisma"
    "src/services/payment.service.ts"
    "src/services/paymentMonitor.service.ts"
    "src/controllers/payment.controller.ts"
    "src/services/__tests__/payment.service.test.ts"
    "src/services/__tests__/paymentMonitor.service.test.ts"
    "jest.config.js"
    "docs/PAYMENT_INHERITANCE_IMPLEMENTATION.md"
    "docs/QUICK_START.md"
    "CHANGELOG.md"
    "IMPLEMENTATION_SUMMARY.md"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓ $file${NC}"
    else
        echo -e "${RED}✗ $file (missing)${NC}"
        exit 1
    fi
done
echo ""

echo "Step 8: Checking schema changes..."
if grep -q "stellar_address" prisma/schema.prisma && grep -q "last_paging_token" prisma/schema.prisma; then
    echo -e "${GREEN}✓ Schema contains new fields${NC}"
else
    echo -e "${RED}✗ Schema missing required fields${NC}"
    exit 1
fi
echo ""

echo "=========================================="
echo -e "${GREEN}All verification checks passed!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Review the implementation documentation:"
echo "   - docs/PAYMENT_INHERITANCE_IMPLEMENTATION.md"
echo "   - docs/QUICK_START.md"
echo "   - IMPLEMENTATION_SUMMARY.md"
echo ""
echo "2. Apply database changes:"
echo "   npm run prisma:push"
echo ""
echo "3. Deploy to staging/production"
echo ""
echo "4. Monitor payment creation and confirmation metrics"
echo ""
