/**
 * OpenAPI Response Validator Helper
 * 
 * Provides utilities for validating API responses against OpenAPI specifications.
 * Used in contract tests to ensure responses match documented schemas.
 */

import SwaggerParser from '@apidevtools/swagger-parser';
import OpenAPIResponseValidator from 'openapi-response-validator';
import { OpenAPIV3 } from 'openapi-types';
import { specs } from '../../docs/swagger';

export interface ValidationResult {
  valid: boolean;
  errors?: Array<{
    message: string;
    path?: string;
    expected?: unknown;
    actual?: unknown;
  }>;
  statusCode: number;
  path: string;
  method: string;
}

export interface ValidationErrorDetail {
  message: string;
  path?: string;
  expected?: unknown;
  actual?: unknown;
}

/**
 * Dereferenced OpenAPI specification ready for validation
 */
interface DereferencedSpec {
  paths: OpenAPIV3.PathsObject;
  components?: OpenAPIV3.ComponentsObject;
}

/**
 * Cache for dereferenced spec to avoid repeated parsing
 */
let cachedSpec: DereferencedSpec | null = null;

/**
 * Load and dereference the OpenAPI specification
 * Caches result to avoid repeated parsing during test runs
 */
export async function loadDereferencedSpec(): Promise<DereferencedSpec> {
  if (cachedSpec) {
    return cachedSpec;
  }

  try {
    // Clone specs to avoid mutating the original
    const specClone = JSON.parse(JSON.stringify(specs));
    
    // Dereference all $ref pointers
    const dereferenced = await SwaggerParser.dereference(specClone);
    
    cachedSpec = {
      paths: dereferenced.paths as OpenAPIV3.PathsObject,
      components: (dereferenced as any).components as OpenAPIV3.ComponentsObject | undefined,
    };
    
    return cachedSpec;
  } catch (error) {
    console.error('Failed to dereference OpenAPI spec:', error);
    throw new Error(
      `OpenAPI spec dereferencing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Create a response validator instance for a specific API operation
 */
export function createValidatorForOperation(
  path: string,
  method: string,
  spec: DereferencedSpec
): OpenAPIResponseValidator | null {
  const pathItem = spec.paths[path];
  
  if (!pathItem) {
    console.warn(`Path not found in spec: ${path}`);
    return null;
  }

  const methodLower = method.toLowerCase();
  const operation = (pathItem as any)[methodLower];
  
  if (!operation) {
    console.warn(`Method ${method.toUpperCase()} not found for path: ${path}`);
    return null;
  }

  const responses = operation.responses;
  
  if (!responses) {
    console.warn(`No responses defined for ${method.toUpperCase()} ${path}`);
    return null;
  }

  const config: any = {
    responses,
    definitions: spec.components?.schemas || {},
    errorTransformer: (openapiError: any, location: string) => {
      return {
        message: openapiError.message,
        path: location,
      };
    },
  };

  return new OpenAPIResponseValidator(config);
}

/**
 * Validate an API response against the OpenAPI specification
 * 
 * @param path - API path (e.g., '/api/v1/payments')
 * @param method - HTTP method (e.g., 'POST')
 * @param statusCode - Response status code to validate
 * @param responseBody - Response body to validate
 * @returns Validation result with errors if any
 */
export async function validateApiResponse(
  path: string,
  method: string,
  statusCode: number,
  responseBody: unknown
): Promise<ValidationResult> {
  try {
    const spec = await loadDereferencedSpec();
    const validator = createValidatorForOperation(path, method, spec);
    
    if (!validator) {
      return {
        valid: false,
        statusCode,
        path,
        method,
        errors: [{
          message: `No OpenAPI documentation found for ${method.toUpperCase()} ${path}`,
          path: undefined,
        }],
      };
    }

    const statusCodes = Object.keys((spec.paths[path] as any)?.[method.toLowerCase()]?.responses || {});
    const hasStatusCode = statusCodes.includes(String(statusCode));
    
    if (!hasStatusCode && statusCode >= 200 && statusCode < 300) {
      // For 2xx responses, check if there's a default or matching range
      const hasDefault = statusCodes.includes('default');
      const has2xx = statusCodes.includes('2XX') || statusCodes.includes('200');
      
      if (!hasDefault && !has2xx) {
        return {
          valid: false,
          statusCode,
          path,
          method,
          errors: [{
            message: `Status code ${statusCode} is not documented. Available codes: ${statusCodes.join(', ')}`,
            path: undefined,
          }],
        };
      }
    }

    const validationResult = validator.validateResponse(statusCode, responseBody);
    const errors = Array.isArray(validationResult) ? validationResult : [];
    
    return {
      valid: errors.length === 0,
      errors,
      statusCode,
      path,
      method,
    };
  } catch (error) {
    return {
      valid: false,
      statusCode,
      path,
      method,
      errors: [{
        message: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        path: undefined,
      }],
    };
  }
}

/**
 * Format validation errors into human-readable messages
 */
export function formatValidationErrors(result: ValidationResult): string[] {
  if (!result.errors || result.errors.length === 0) {
    return [];
  }

  const messages: string[] = [];
  
  messages.push(`\n❌ OpenAPI Contract Violation for ${result.method.toUpperCase()} ${result.path}`);
  messages.push(`   Status Code: ${result.statusCode}\n`);

  result.errors.forEach((error, index) => {
    messages.push(`   Error ${index + 1}:`);
    messages.push(`     Message: ${error.message}`);
    
    if (error.path) {
      messages.push(`     Path: ${error.path}`);
    }
    
    if ((error as any).expected !== undefined) {
      messages.push(`     Expected: ${JSON.stringify((error as any).expected)}`);
    }
    
    if ((error as any).actual !== undefined) {
      messages.push(`     Actual: ${JSON.stringify((error as any).actual)}`);
    }
    
    messages.push('');
  });

  return messages;
}

/**
 * Assert that a response matches the OpenAPI spec
 * Throws an assertion error with detailed message if validation fails
 */
export async function assertMatchesSpec(
  path: string,
  method: string,
  statusCode: number,
  responseBody: unknown
): Promise<void> {
  const result = await validateApiResponse(path, method, statusCode, responseBody);
  
  if (!result.valid) {
    const messages = formatValidationErrors(result);
    const error = new Error(messages.join('\n'));
    error.name = 'OpenAPIContractError';
    throw error;
  }
}

/**
 * Clear the cached spec (useful for testing the validator itself)
 */
export function clearSpecCache(): void {
  cachedSpec = null;
}
