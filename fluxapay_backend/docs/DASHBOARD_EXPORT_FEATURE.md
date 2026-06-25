# Dashboard Export Feature Implementation

## Overview
This document outlines the implementation of export buttons for payments, settlements, and webhooks in the FluxaPay dashboard. The goal is to provide merchants with quick access to export data for accounting purposes.

## Technical Requirements
1. **Payments Export**: CSV export via backend.
2. **Settlements Export**: CSV/PDF export as supported.
3. **Webhook Logs Export**: Optional export with filters.

## Implementation Steps
### 1. Update Dashboard Controller
- Add methods to handle export requests for payments, settlements, and webhooks.

### 2. Update Dashboard Service
- Implement logic to fetch data and format it as CSV/PDF.

### 3. Update Dashboard Routes
- Create new routes for the export functionality.

### 4. Frontend Changes
- Add buttons to the dashboard UI for exporting payments, settlements, and webhooks.

### 5. Testing
- Ensure all new features are tested thoroughly to avoid errors.

## Example Code Snippets
### Dashboard Controller
```typescript
// Add export methods in dashboard.controller.ts
export async function exportPayments(req: AuthRequest, res: Response) {
    // Logic to fetch payments and return as CSV
}

export async function exportSettlements(req: AuthRequest, res: Response) {
    // Logic to fetch settlements and return as CSV/PDF
}

export async function exportWebhooks(req: AuthRequest, res: Response) {
    // Logic to fetch webhook logs and return as CSV
}
```

### Dashboard Routes
```typescript
// Add new routes in dashboard.route.ts
router.get("/export/payments", dashboardController.exportPayments);
router.get("/export/settlements", dashboardController.exportSettlements);
router.get("/export/webhooks", dashboardController.exportWebhooks);
```

### Frontend Button Example
```html
<button onclick="exportPayments()">Export Payments</button>
<button onclick="exportSettlements()">Export Settlements</button>
<button onclick="exportWebhooks()">Export Webhooks</button>
```

## Conclusion
This implementation will enhance the dashboard functionality, allowing merchants to easily export necessary data for their accounting needs.