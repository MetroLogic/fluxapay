# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-03-25

### Added
- Initial release of FluxaPay Public API.
- Merchant onboarding and KYC verification flow.
- Payment gateway integration with Stellar blockchain.
- Settlement processing for local fiat currencies.
- Admin dashboard for system oversight.
- Audit logging for admin actions.
- Reconciliation services for transaction accuracy.

### Changed
- Refactored payment processing logic for better performance.
- Improved validation for merchant document uploads.

### Deprecated
- Legacy `/api/v1/auth/login-old` endpoint.

### Removed
- Initial beta testing code from production branches.

### Fixed
- Issue with decimal precision in cross-currency transactions.
- Bug in settlement batch calculation for large volumes.
- Error handling in webhook delivery service.

### Security
- Implemented JWT-based authentication for all API endpoints.
- Added RBAC (Role-Based Access Control) for admin operations.
- Enhanced sensitive data redaction in logs.
