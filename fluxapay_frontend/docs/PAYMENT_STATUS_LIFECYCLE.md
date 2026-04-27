# Payment Status Lifecycle

## Enum Values (PaymentStatus)
- `pending`: Newly created, awaiting payment.
- `partially_paid`: Some funds received (< amount).
- `confirmed`: Full amount received + Soroban verified.
- `overpaid`: Funds > expected amount.
- `expired`: Timeout (15min no payment).
- `failed`: On-chain verification failed or invalid tx.

## Flow
1. Create → pending
2. Monitor detects partial → partially_paid
3. Monitor full → confirmed/overpaid → verifyPayment → confirmed
4. Timeout → expired
5. Verify fail → failed

## Frontend Mapping
Update types to full enum. Terminal: confirmed/overpaid/expired/failed.

