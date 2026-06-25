# Stellar Fee Bump Strategy

To reduce transaction failures during network congestion, FluxaPay uses retry with fee bumping for Stellar transaction submission paths.

## Strategy

- Start from `STELLAR_BASE_FEE`.
- For each retry, multiply by `STELLAR_FEE_BUMP_MULTIPLIER`.
- Cap each attempt fee at `STELLAR_MAX_FEE`.
- Stop after `STELLAR_TX_MAX_RETRIES` attempts.

Formula per attempt:

`fee(attempt) = min(STELLAR_MAX_FEE, floor(STELLAR_BASE_FEE * STELLAR_FEE_BUMP_MULTIPLIER^(attempt-1)))`

## Defaults

- `STELLAR_BASE_FEE=100`
- `STELLAR_MAX_FEE=2000`
- `STELLAR_FEE_BUMP_MULTIPLIER=2`
- `STELLAR_TX_MAX_RETRIES=3`

## Alerting behavior

When retries are exhausted, services emit repeated-failure alerts in logs and metrics:

- `stellar.operation.repeated_failures`
- `stellar.sweep.repeated_failures`
- `stellar.refund.repeated_failures`

## Covered transaction paths

- Account creation and trustline setup in `StellarService`.
- Sweep submissions in `SweepService`.
- Refund submissions in `StellarRefundService`.
