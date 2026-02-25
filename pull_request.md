# Pull Request: Normalize Payment Statuses and Soroban Integration

## Description
This PR improves the payment monitoring system by normalizing payment statuses, adding support for cumulative/partial payments, and integrating with the Soroban smart contract for on-chain verification.

## Changes

### 1. Payment Status Normalization
- Refactored `paymentMonitor.service.ts` to use consistent statuses:
    - **`confirmed`**: Exact payment received.
    - **`overpaid`**: More than the expected amount received.
    - **`partially_paid`**: Some payment has been received, but it is less than the expected amount.
    - **`expired`**: Payment window closed without completion.

### 2. Cumulative Payment Monitoring
- The system now checks the **total account balance** for USDC on the derived address.
- This allows multiple small payments to sum up to the total expected amount.

### 3. Soroban Smart Contract Verification
- Introduced `SorobanService.ts` for contract interactions.
- Added a call to `verify_payment` on the Soroban contract upon payment confirmation.
- Includes safe amount conversion (stroops as BigInt/i128).

### 4. Robustness Improvements
- Automated expiration handling in the monitoring loop.
- Improved error handling for cases where the Stellar account hasn't been created on-chain.

### 5. Integration with Unified Monitor Tick
- Merged normalization logic with the new `runPaymentMonitorTick` structure from `main`, ensuring compatibility with the project's background job system.

## Technical Details
- Added `PAYMENT_CONTRACT_ID` to `.env.example`.
- Updated unit tests in `paymentMonitor.service.test.ts` to match the new status logic and cumulative checks.

## Verification
- [x] Unit tests updated.
- [x] Code reviewed for Stellar/Soroban SDK compatibility.
- [x] Pushed to branch `feature/payment-monitor-normalization`.
- [x] Merge conflicts with `main` resolved.

#136
