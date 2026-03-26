# API Keys: Migrate to Hashed-Only Storage - TODO

Current working directory: `/Users/devsol/Documents/github repos/Wave/fluxapay`

## Plan Steps (Approved)
1. ✅ Create TODO.md (tracking progress)
2. ✅ Update Prisma schema (`fluxapay_backend/prisma/schema.prisma`) - Add `api_key_hashed` and `api_key_last_four`
3. ✅ Schema/DB ready (Prisma client generated)
4. ✅ Services implemented: signup returns raw key once, stores hash+last4; /me masked; regenerate/rotate work
5. ✅ Tests updated and passing
6. ✅ Backfill script created
7. Run backfill: `cd fluxapay_backend && ts-node src/scripts/backfill-api-keys.ts` (when DB available)
8. Test endpoints
9. Commit & PR

**Status:** Implementation complete. Tests passing. Ready for backfill when database is available.
