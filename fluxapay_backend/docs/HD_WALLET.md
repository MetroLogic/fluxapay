# HD Wallet Service Documentation

## Overview
The `HDWalletService` provides a mechanism to derive unique, deterministic Stellar addresses for each payment request using BIP44 path `m/44'/148'/<merchantIndex>'/<paymentIndex>'` (SLIP-0044 coin type 148 = Stellar).

## Seed Handling
Master seeds may be supplied as:
1. **64-char hex (32 bytes)** — expanded to 64 bytes with `HMAC-SHA512("ed25519 seed", seed32)` (SLIP-0010 style), then passed to `ed25519-hd-key`.
2. **Arbitrary string** — hashed with SHA-512 to produce a 64-byte seed.

Do **not** expand a 32-byte seed by concatenating it with itself; that produces non-standard keypairs that will not match third-party BIP44 Stellar wallets.

## Migration / Recovery Notes
- Existing payment rows already store `stellar_address`, `payment_index`, `derivation_path`, and optional `encrypted_key_data` in the database.
- Changing seed expansion only affects **new** derivations and regenerations that re-derive from the master seed.
- Stored `stellar_address` values are **not** rewritten. Funds already received at historical addresses remain sweepable using the stored path/indices with the seed expansion that was in effect when they were created, or via the stored address itself for monitoring.
- After deploying HMAC-based expansion, operators should treat newly derived addresses as a new derivation epoch; do not expect old addresses to match new HMAC-expanded keypairs for the same indices.

## Usage

### Deriving an Address
```typescript
const address = await hdWalletService.derivePaymentAddress('merchant_123', 'payment_456');
```

### Regenerating Keys (Sweeping)
```typescript
const { secretKey } = await hdWalletService.regenerateKeypair(merchantIndex, paymentIndex);
// or
const { secretKey } = await hdWalletService.regenerateKeypairFromPath("m/44'/148'/0'/7'");
```

## Security
- The `master_seed` must be kept secure and never exposed (prefer KMS).
- Merchant and payment indices are public metadata; the master seed is the secret that binds them to private keys.
