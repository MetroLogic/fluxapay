/**
 * Business Registration Number Validation
 * 
 * Country-to-regex mapping for validating business registration numbers.
 * Supports the top 10 markets with different registration formats.
 */

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export interface CountryRegistrationFormat {
  country: string;
  countryCode: string;
  pattern: RegExp;
  format: string;
  example: string;
}

/**
 * Regex patterns for business registration numbers by country.
 * 
 * Sources:
 * - Nigeria: Corporate Affairs Commission (CAC) RC numbers
 * - Kenya: Business Registration Service certificate numbers
 * - South Africa: CIPC registration numbers
 * - Ghana: Registrar General's Department numbers
 * - UK: Companies House numbers
 * - USA: EIN (Employer Identification Number)
 * - Canada: Business Number (BN)
 * - Germany: Handelsregisternummer (HRB)
 * - France: SIREN number
 * - India: Corporate Identity Number (CIN)
 */
export const BUSINESS_REGISTRATION_PATTERNS: Record<string, CountryRegistrationFormat> = {
  NG: {
    country: "Nigeria",
    countryCode: "NG",
    pattern: /^RC\s?\d{6,7}$/i,
    format: "RC followed by 6-7 digits",
    example: "RC123456 or RC1234567",
  },
  KE: {
    country: "Kenya",
    countryCode: "KE",
    pattern: /^(CPR\/\d{4}\/\d{6,8}|PVT-[A-Z0-9]{8,12})$/i,
    format: "CPR/YYYY/NNNNNN or PVT-XXXXXXXX",
    example: "CPR/2020/123456 or PVT-A1B2C3D4",
  },
  ZA: {
    country: "South Africa",
    countryCode: "ZA",
    pattern: /^\d{4}\/\d{6}\/\d{2}$/,
    format: "YYYY/NNNNNN/NN",
    example: "2020/123456/07",
  },
  GH: {
    country: "Ghana",
    countryCode: "GH",
    pattern: /^(CS|BN)\d{9,12}$/i,
    format: "CS or BN followed by 9-12 digits",
    example: "CS123456789 or BN123456789012",
  },
  GB: {
    country: "United Kingdom",
    countryCode: "GB",
    pattern: /^([A-Z]{2}\d{6}|\d{8}|[A-Z]{2}\d{5}[A-Z])$/i,
    format: "8 digits or 2 letters + 6 digits or 2 letters + 5 digits + letter",
    example: "12345678 or AB123456 or SC123456",
  },
  US: {
    country: "United States",
    countryCode: "US",
    pattern: /^\d{2}-?\d{7}$/,
    format: "XX-XXXXXXX (EIN format)",
    example: "12-3456789 or 123456789",
  },
  CA: {
    country: "Canada",
    countryCode: "CA",
    pattern: /^\d{9}(RP|RC|RT)\d{4}$/i,
    format: "9 digits + RP/RC/RT + 4 digits",
    example: "123456789RP0001",
  },
  DE: {
    country: "Germany",
    countryCode: "DE",
    pattern: /^(HRB|HRA)\s?\d{4,6}$/i,
    format: "HRB or HRA followed by 4-6 digits",
    example: "HRB 12345 or HRA1234",
  },
  FR: {
    country: "France",
    countryCode: "FR",
    pattern: /^\d{9}$/,
    format: "9 digits (SIREN)",
    example: "123456789",
  },
  IN: {
    country: "India",
    countryCode: "IN",
    pattern: /^[UL]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/i,
    format: "U/L + 5 digits + 2 letters + 4 digits + 3 letters + 6 digits (CIN)",
    example: "U12345AB2020PLC123456",
  },
};

/**
 * Validate a business registration number against country-specific format.
 * 
 * @param registrationNumber - The registration number to validate
 * @param countryCode - ISO 3166-1 alpha-2 country code (e.g., "NG", "KE")
 * @returns Validation result with success status and optional error message
 */
export function validateBusinessRegistration(
  registrationNumber: string,
  countryCode: string
): ValidationResult {
  // Empty registration number is valid (not required in some cases)
  if (!registrationNumber || registrationNumber.trim() === "") {
    return { valid: true };
  }

  const trimmedNumber = registrationNumber.trim();
  const format = BUSINESS_REGISTRATION_PATTERNS[countryCode.toUpperCase()];

  // If country not in our validation map, allow any format
  if (!format) {
    return { valid: true };
  }

  const isValid = format.pattern.test(trimmedNumber);

  if (!isValid) {
    return {
      valid: false,
      message: `Invalid format for ${format.country}. Expected: ${format.format}. Example: ${format.example}`,
    };
  }

  return { valid: true };
}

/**
 * Get the expected format description for a country.
 * 
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns Format description or null if country not supported
 */
export function getRegistrationFormat(countryCode: string): string | null {
  const format = BUSINESS_REGISTRATION_PATTERNS[countryCode.toUpperCase()];
  return format ? `${format.format} (e.g., ${format.example})` : null;
}

/**
 * Check if a country has registration validation.
 * 
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns True if validation is available for this country
 */
export function hasRegistrationValidation(countryCode: string): boolean {
  return countryCode.toUpperCase() in BUSINESS_REGISTRATION_PATTERNS;
}
