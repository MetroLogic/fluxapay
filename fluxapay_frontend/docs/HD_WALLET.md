# HD Wallet Service Documentation

## Overview
The `HDWalletService` provides a mechanism to derive unique, deterministic Stellar addresses for each payment request. This allows the system to track payments individually and sweep funds securely.

## Derivation Scheme
Unlike standard BIP-44 HD wallets, this service uses a hash-based derivation scheme to ensure uniqueness based on `merchant_id` and `payment_id`.

### Algorithm
1. **Input**: `master_seed` (server-side secret), `merchant_id`, `payment_id`.
2. **Seed Generation**:
   ```
   seed = SHA256(master_seed + ":" + merchant_id + ":" + payment_id)
   ```
   The result is a 32-byte hash.
3. **Keypair Generation**:
   The 32-byte `seed` is used as the raw seed for an Ed25519 keypair.
   ```javascript
   keypair = Keypair.fromRawEd25519Seed(seed)
   ```

## Usage

### Deriving an Address
To generate a payment address for a user to send funds to:
```typescript
const address = hdWalletService.derivePaymentAddress('merchant_123', 'payment_456');
```

### Regenerating Keys (Sweeping)
To sign a transaction to move funds from the payment address:
```typescript
const { secretKey } = hdWalletService.regenerateKeypair('merchant_123', 'payment_456');
// Use secretKey to sign transaction
```

## Security
- The `master_seed` must be kept secure and never exposed.
- `merchant_id` and `payment_id` are public information but are combined with the secret `master_seed` to produce the private key.
- SHA-256 ensures that the resulting seed is uniformly distributed and valid for Ed25519.
