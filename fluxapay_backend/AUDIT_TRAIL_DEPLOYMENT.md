# Audit Trail Implementation - Deployment Guide

## Overview

This implementation provides a complete audit trail for critical operations in the FluxaPay backend, tracking:
- **KYC Reviews**: Approvals and rejections by admins
- **Sweep Operations**: Manual and automated sweep triggers and completions
- **Settlement Batches**: Batch initiation and completion with statistics
- **Configuration Changes**: System configuration modifications (ready for future integration)

## ✅ Technical Requirements Met

1. **AuditLog Model**: Created with actor, action, entity, metadata, and timestamp fields
2. **Integration**: Logs emitted from sweep, settlement batch, and KYC review endpoints
3. **Admin Query Endpoint**: REST API to query audit logs with filters and pagination

## Database Schema

### New Models and Enums

The following has been added to `prisma/schema.prisma`:

```prisma
// Audit Logging
model AuditLog {
  id          String          @id @default(cuid())
  admin_id    String
  action_type AuditActionType
  entity_type AuditEntityType
  entity_id   String
  details     Json
  created_at  DateTime        @default(now())

  @@index([created_at])
  @@index([admin_id])
  @@index([action_type])
  @@index([entity_id])
  @@index([entity_type, entity_id])
}

enum AuditActionType {
  kyc_approve
  kyc_reject
  config_change
  sweep_trigger
  sweep_complete
  sweep_fail
  settlement_batch_initiate
  settlement_batch_complete
  settlement_batch_fail
}

enum AuditEntityType {
  merchant_kyc
  system_config
  sweep_operation
  settlement_batch
}
```

## Deployment Steps

### Step 1: Run Database Migration

Apply the schema changes to your database:

```bash
cd fluxapay_backend

# For development (creates migration and applies it)
npx prisma migrate dev --name add_audit_logging

# For production (apply existing migrations)
npx prisma migrate deploy
```

### Step 2: Generate Prisma Client

```bash
npx prisma generate
```

This will generate TypeScript types for the new `AuditLog` model and enums.

### Step 3: Update Imports (If Needed)

After generating the Prisma client, you can optionally update the imports to use the generated types instead of local enums:

**File**: `src/types/audit.types.ts`

Replace:
```typescript
// Define enums locally to avoid dependency on generated client before migration
export enum AuditActionType { ... }
export enum AuditEntityType { ... }
export enum KYCStatus { ... }
```

With:
```typescript
import { AuditActionType, AuditEntityType, KYCStatus } from '../generated/client';
```

**File**: `src/services/audit.service.ts`

Update import:
```typescript
import { PrismaClient, AuditActionType, AuditEntityType, KYCStatus, Prisma } from '../generated/client';
```

Remove local imports from types.

**File**: `src/controllers/audit.controller.ts`

Update import:
```typescript
import { AuditActionType } from '../generated/client';
```

### Step 4: Build and Test

```bash
# Build the project
npm run build

# Run tests (optional)
npm test -- audit
```

### Step 5: Deploy

```bash
npm start
```

## API Usage

### Query Audit Logs

**Endpoint**: `GET /api/v1/admin/audit-logs`

**Authentication**: Requires JWT token + Admin secret (`X-Admin-Secret` header)

**Query Parameters**:
- `date_from` - Filter logs from this date (ISO 8601 format)
- `date_to` - Filter logs until this date (ISO 8601 format)
- `admin_id` - Filter by admin user ID
- `action_type` - Filter by action type (e.g., `kyc_approve`, `sweep_trigger`)
- `entity_id` - Filter by entity ID (e.g., merchant ID, batch ID)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50, max: 100)

**Example**:
```bash
curl -H "Authorization: Bearer <admin-token>" \
     -H "X-Admin-Secret: <admin-secret>" \
     "http://localhost:3000/api/v1/admin/audit-logs?action_type=kyc_approve&limit=20"
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "clx123abc",
      "admin_id": "admin-123",
      "action_type": "kyc_approve",
      "entity_type": "merchant_kyc",
      "entity_id": "merchant-456",
      "details": {
        "merchant_id": "merchant-456",
        "previous_status": "pending_review",
        "new_status": "approved",
        "reason": null,
        "reviewed_at": "2024-02-25T10:30:00.000Z"
      },
      "created_at": "2024-02-25T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

### Get Specific Audit Log

**Endpoint**: `GET /api/v1/admin/audit-logs/:id`

**Example**:
```bash
curl -H "Authorization: Bearer <admin-token>" \
     -H "X-Admin-Secret: <admin-secret>" \
     "http://localhost:3000/api/v1/admin/audit-logs/clx123abc"
```

## Integration Points

### 1. KYC Review Endpoints

**File**: `src/services/kyc.service.ts`

When an admin approves or rejects a KYC submission:

```typescript
await prisma.$transaction(async (tx) => {
  // Update KYC status
  const updatedKyc = await tx.merchantKYC.update({ ... });

  // Create audit log
  await logKycDecision(
    {
      adminId: reviewerId,
      merchantId,
      action, // 'approve' | 'reject'
      previousStatus,
      newStatus,
      reason,
    },
    tx
  );
});
```

### 2. Sweep Operations

**File**: `src/services/sweep.service.ts`

When a sweep is triggered:
```typescript
const auditLog = await logSweepTrigger({
  adminId,
  sweepType: dryRun ? "dry_run" : "scheduled",
  reason: "Sweep paid but unswept payments into master vault",
});
```

When sweep completes:
```typescript
await updateSweepCompletion({
  auditLogId: auditLog.id,
  status: addressesSwept === 0 ? "failed" : "completed",
  statistics: {
    addresses_swept: addressesSwept,
    total_amount: total.toFixed(7),
    transaction_hash: txHashes[0],
  },
});
```

### 3. Settlement Batch Operations

**File**: `src/services/settlementBatch.service.ts`

When batch starts:
```typescript
const auditLog = await logSettlementBatch({
  adminId,
  batchId,
  reason: 'Scheduled settlement batch run',
});
```

When batch completes:
```typescript
await updateSettlementBatchCompletion({
  auditLogId: auditLog.id,
  status: failed > 0 ? 'failed' : 'completed',
  transactionCount: succeeded,
  totalAmount,
  currency: 'USD',
  failureReason: failed > 0 ? `${failed} merchant settlements failed` : undefined,
});
```

## Audit Log Structure

### Action Types

| Action | Description | Entity Type |
|--------|-------------|-------------|
| `kyc_approve` | KYC application approved | `merchant_kyc` |
| `kyc_reject` | KYC application rejected | `merchant_kyc` |
| `config_change` | System configuration modified | `system_config` |
| `sweep_trigger` | Sweep operation initiated | `sweep_operation` |
| `sweep_complete` | Sweep completed successfully | `sweep_operation` |
| `sweep_fail` | Sweep operation failed | `sweep_operation` |
| `settlement_batch_initiate` | Settlement batch started | `settlement_batch` |
| `settlement_batch_complete` | Settlement batch completed | `settlement_batch` |
| `settlement_batch_fail` | Settlement batch failed | `settlement_batch` |

### Details Field Examples

#### KYC Decision
```json
{
  "merchant_id": "merchant-123",
  "previous_status": "pending_review",
  "new_status": "approved",
  "reason": null,
  "reviewed_at": "2024-02-25T10:30:00.000Z"
}
```

#### Sweep Operation
```json
{
  "sweep_type": "scheduled",
  "trigger_reason": "Sweep paid but unswept payments into master vault",
  "status": "completed",
  "statistics": {
    "addresses_swept": 15,
    "total_amount": "12500.5000000",
    "transaction_hash": "abc123..."
  }
}
```

#### Settlement Batch
```json
{
  "batch_id": "batch_1709123456789",
  "initiation_reason": "Scheduled settlement batch run",
  "status": "completed",
  "transaction_count": 45,
  "total_amount": 8750.25,
  "currency": "USD",
  "completed_at": "2024-02-25T10:35:00.000Z"
}
```

## Security & Compliance

### Access Control

- All audit log endpoints require:
  - Valid JWT authentication token
  - Admin secret header (`X-Admin-Secret`)
- Audit logs are immutable (cannot be updated or deleted via API)
- Only read operations are allowed

### Data Retention

Consider implementing a data retention policy:

```sql
-- Example: Archive audit logs older than 7 years
-- (Add to your maintenance cron jobs)
```

### Audit Trail Integrity

- Audit logs are created within database transactions
- Failed operations don't create partial audit entries
- Each log entry has a unique ID and timestamp

## Monitoring & Alerting

### Key Metrics to Track

1. **Audit Log Volume**: Number of logs created per day
2. **Action Distribution**: Breakdown by action type
3. **Admin Activity**: Logs per admin user
4. **Error Rate**: Failed audit log creation attempts

### Example Queries

**Find all KYC rejections by a specific admin**:
```bash
GET /api/v1/admin/audit-logs?action_type=kyc_reject&admin_id=admin-123
```

**Find all failed sweep operations**:
```bash
GET /api/v1/admin/audit-logs?action_type=sweep_fail
```

**Get settlement batches from last week**:
```bash
GET /api/v1/admin/audit-logs?action_type=settlement_batch_initiate&date_from=2024-02-18&date_to=2024-02-25
```

## Troubleshooting

### Migration Fails

**Error**: `Table 'AuditLog' doesn't exist`

**Solution**: Run the migration:
```bash
npx prisma migrate dev --name add_audit_logging
```

### Prisma Client Not Generated

**Error**: `Cannot find module '../generated/client'`

**Solution**:
```bash
npx prisma generate
```

### Audit Logs Not Being Created

**Check**:
1. Verify `ADMIN_SECRET` is configured
2. Check database connection
3. Review logs for audit service errors
4. Ensure transaction context is passed correctly

## Files Modified/Created

### Modified Files
- `prisma/schema.prisma` - Added AuditLog model and enums
- `src/types/audit.types.ts` - Added local enum definitions

### Existing Files (Already Implemented)
- `src/services/audit.service.ts` - Audit logging service
- `src/controllers/audit.controller.ts` - Audit log API endpoints
- `src/routes/audit.route.ts` - Audit log routes
- `src/services/kyc.service.ts` - KYC audit integration
- `src/services/sweep.service.ts` - Sweep audit integration
- `src/services/settlementBatch.service.ts` - Settlement audit integration

### Test Files (Already Implemented)
- `src/services/__tests__/audit.service.test.ts`
- `src/services/__tests__/audit.kyc.integration.test.ts`
- `src/controllers/__tests__/audit.controller.test.ts`

## Next Steps (Optional Enhancements)

1. **Config Change Tracking**: Integrate with configuration management system
2. **Property-Based Tests**: Add fast-check tests for audit service
3. **Admin UI**: Build web interface for viewing audit logs
4. **CSV Export**: Add endpoint to export filtered audit logs
5. **Swagger Documentation**: Add OpenAPI specs for audit endpoints
6. **Data Retention**: Implement automated archival/deletion policy

## Support

For issues or questions:
1. Check the audit service logs for error messages
2. Verify database migration was successful
3. Ensure Prisma client is generated
4. Review test files for usage examples
