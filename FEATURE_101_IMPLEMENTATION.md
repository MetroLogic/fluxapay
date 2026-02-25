# Feature #101: Dynamic API Keys & Documentation Links

## Summary
Fixed the static developers portal by implementing dynamic API key fetching from authenticated user context and updating all documentation links to point to actual routes instead of "#".

## Changes Made

### Backend Changes

#### 1. Database Schema (`fluxapay_backend/prisma/schema.prisma`)
- Added `api_key` field to the `Merchant` model
- Field is optional and unique to prevent duplicates
- Type: `String?` with `@unique` constraint

#### 2. Merchant Service (`fluxapay_backend/src/services/merchant.service.ts`)
- Created `generateApiKey()` helper function to generate secure API keys
- Updated `signupMerchantService()` to automatically generate and store API key on merchant registration
- Updated `getMerchantUserService()` to include `api_key` in the response (with explicit select)
- Updated `regenerateApiKeyService()` to store the new API key in the database

### Frontend Changes

#### 1. Documentation URLs (`fluxapay_frontend/src/lib/docs.ts`)
- Created new constants file for centralized documentation URL management
- Defined all documentation routes:
  - API Reference: `/docs/api-reference`
  - Getting Started: `/docs/getting-started`
  - Authentication: `/docs/authentication`
  - Rate Limits: `/docs/rate-limits`
  - Full Docs: `/docs`
  - Community: `/community`
  - Support: `/support`
  - Status: `/status`
  - FAQs: `/faqs`
  - Contact: `/contact`
  - Pricing: `/pricing`

#### 2. Developers Portal (`fluxapay_frontend/src/app/dashboard/developers/page.tsx`)
- Removed hardcoded API key: `"sk_live_51234567890abcdefghijklmnop"`
- Added `useEffect` hook to fetch real API key from authenticated user
- Added loading state management
- Updated all documentation links to use `DOCS_URLS` constants
- Links updated:
  - API Reference
  - Getting Started
  - Authentication
  - Rate Limits
  - Full Documentation
  - Community Support
  - Status & Support

#### 3. Settings Page (`fluxapay_frontend/src/features/settings/components/SettingsPage.tsx`)
- Removed hardcoded API key placeholder
- Updated `loadMerchantData()` to fetch and set the real API key
- Changed initial state from hardcoded value to "Loading..."
- API key now displays actual value from database

#### 4. Footer Component (`fluxapay_frontend/src/features/landing/sections/Footer.tsx`)
- Imported `DOCS_URLS` constants
- Updated all footer links:
  - Privacy Policy: `/privacy`
  - Terms of Use: `/terms`
  - Sign Up: `/signup`
  - Log In: `/login`
  - Pricing: `/pricing`
  - Docs: `/docs`
  - FAQs / Support: `/faqs`
  - Contact us: `/contact`

#### 5. Navbar Component (`fluxapay_frontend/src/features/landing/components/Navbar.tsx`)
- Imported `DOCS_URLS` constants
- Updated navigation links:
  - Pricing: `/pricing`
  - Documentation: `/docs`

## Database Migration Required

To apply the schema changes, run:

```bash
cd fluxapay_backend
npx prisma migrate dev --name add_api_key_to_merchant
# or
npm run prisma:push
```

This will:
1. Add the `api_key` column to the `Merchant` table
2. Set it as nullable and unique
3. Regenerate Prisma Client with the new schema

### Generate API Keys for Existing Merchants

After running the migration, generate API keys for existing merchants:

```bash
cd fluxapay_backend
npx ts-node src/scripts/generate-api-keys.ts
```

This script will:
- Find all merchants without API keys
- Generate unique API keys for each
- Update the database with the new keys
- Provide a summary of successful and failed operations

## Testing Checklist

- [ ] Verify API key is generated on new merchant signup
- [ ] Verify API key is displayed in Developers Portal
- [ ] Verify API key is displayed in Settings page
- [ ] Verify API key regeneration works and updates in database
- [ ] Verify all documentation links navigate to correct routes
- [ ] Verify footer links work correctly
- [ ] Verify navbar links work correctly
- [ ] Test with existing merchants (they will have null api_key initially)

## Notes

- Existing merchants in the database will have `null` for `api_key` until they regenerate their key
- Consider adding a migration script to generate API keys for existing merchants
- The API key format is: `fluxapay_live_` + 32 random alphanumeric characters
- All documentation routes are now defined but may need actual page implementations
