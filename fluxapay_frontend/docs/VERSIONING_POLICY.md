# API Versioning Policy

FluxaPay follows a predictable versioning strategy to ensure stability for merchants and developers.

## 1. Semantic Versioning (SemVer)

We adhere to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

- **MAJOR version (`X.0.0`):** Incompatible API changes (breaking changes).
- **MINOR version (`0.X.0`):** Functionality in a backwards-compatible manner.
- **PATCH version (`0.0.X`):** Backwards-compatible bug fixes.

### Product Version vs. API Version

- **Product Version (e.g., v1.0.0):** Reflects the overall release of the FluxaPay platform (dashboard, SDKs, backend features).
- **API Version (e.g., /api/v1):** Reflects the version of the public endpoints. Breaking changes in the API will increment the major version in the URL.

## 2. Deprecation Policy

When an API endpoint is scheduled for removal, we will:

1.  **Mark as Deprecated:** Update documentation and add a warning to the response.
2.  **Add Deprecation Headers:** Include `Deprecation` and `Sunset` HTTP headers.
    - `Deprecation: <date>` Indicates when the endpoint was deprecated.
    - `Sunset: <date>` Indicates when the endpoint will be removed.
3.  **Communication:** Notify merchants at least 3 months prior to removal for minor versions and 6 months for major versions.

## 3. Breaking Changes

A breaking change is any change that could cause an existing integration to fail:
- Removing an endpoint.
- Renaming a required request parameter.
- Changing the data type of a response field.
- Changing the HTTP method of an endpoint.

## 4. Changelog

All changes are documented in the root `CHANGELOG.md` file. Each release will categorize changes into:
- **Added:** For new features.
- **Changed:** For changes in existing functionality.
- **Deprecated:** For soon-to-be removed features.
- **Removed:** For now-removed features.
- **Fixed:** For any bug fixes.
- **Security:** In case of vulnerabilities.
