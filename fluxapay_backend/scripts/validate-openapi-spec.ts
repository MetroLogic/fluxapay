/**
 * OpenAPI Specification Validator
 * 
 * Validates the generated Swagger/OpenAPI specification for:
 * - Syntax correctness
 * - Required fields presence
 * - Common documentation issues
 * - Schema consistency
 * 
 * Exit codes:
 * - 0: Validation passed
 * - 1: Validation failed
 */

import SwaggerParser from '@apidevtools/swagger-parser';
import { specs } from '../src/docs/swagger';

interface ValidationError {
  severity: 'error' | 'warning';
  message: string;
  path?: string;
}

class OpenAPIValidator {
  private errors: ValidationError[] = [];
  private warnings: ValidationError[] = [];

  /**
   * Validate the OpenAPI specification
   */
  async validate(): Promise<boolean> {
    console.log('🔍 Validating OpenAPI Specification...\n');

    // Step 1: Basic structure validation
    this.validateBasicStructure();

    // Step 2: Validate with Swagger Parser
    await this.validateWithParser();

    // Step 3: Check for common issues
    this.checkCommonIssues();

    // Step 4: Validate paths and operations
    this.validatePathsAndOperations();

    // Report results
    this.reportResults();

    return this.errors.length === 0;
  }

  /**
   * Validate basic OpenAPI structure
   */
  private validateBasicStructure(): void {
    console.log('✓ Checking basic structure...');

    const spec = specs as any;

    if (!spec.openapi) {
      this.errors.push({
        severity: 'error',
        message: 'Missing required field: openapi version',
      });
    }

    if (!spec.info) {
      this.errors.push({
        severity: 'error',
        message: 'Missing required field: info',
      });
    } else {
      if (!spec.info.title) {
        this.errors.push({
          severity: 'error',
          message: 'Missing required field: info.title',
        });
      }
      if (!spec.info.version) {
        this.errors.push({
          severity: 'error',
          message: 'Missing required field: info.version',
        });
      }
    }

    if (!spec.paths || Object.keys(spec.paths).length === 0) {
      this.errors.push({
        severity: 'error',
        message: 'No API paths defined in specification',
      });
    }
  }

  /**
   * Validate using Swagger Parser (dereferencing and syntax check)
   */
  private async validateWithParser(): Promise<void> {
    console.log('✓ Validating syntax and dereferencing schemas...');

    try {
      const specClone = JSON.parse(JSON.stringify(specs));
      await SwaggerParser.validate(specClone);
      console.log('  ✓ Syntax validation passed');

      // Try to dereference
      const dereferenced = await SwaggerParser.dereference(specClone);
      console.log('  ✓ Schema dereferencing successful');

      if (!dereferenced.paths || Object.keys(dereferenced.paths).length === 0) {
        this.errors.push({
          severity: 'error',
          message: 'No paths found after dereferencing',
        });
      }
    } catch (error) {
      this.errors.push({
        severity: 'error',
        message: `Swagger parser validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        path: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  /**
   * Check for common documentation issues
   */
  private checkCommonIssues(): void {
    console.log('✓ Checking for common documentation issues...');

    const spec = specs as any;
    const paths = spec.paths || {};

    Object.entries(paths).forEach(([path, pathItem]) => {
      if (!pathItem) return;

      const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
      
      methods.forEach((method) => {
        const operation = (pathItem as any)[method];
        if (!operation) return;

        // Check for summary
        if (!operation.summary) {
          this.warnings.push({
            severity: 'warning',
            message: `Missing summary for ${method.toUpperCase()} ${path}`,
            path: `${path} (${method})`,
          });
        }

        // Check for description
        if (!operation.description) {
          this.warnings.push({
            severity: 'warning',
            message: `Missing description for ${method.toUpperCase()} ${path}`,
            path: `${path} (${method})`,
          });
        }

        // Check for tags
        if (!operation.tags || operation.tags.length === 0) {
          this.warnings.push({
            severity: 'warning',
            message: `No tags defined for ${method.toUpperCase()} ${path}`,
            path: `${path} (${method})`,
          });
        }

        // Check for operationId (useful for SDK generation)
        if (!operation.operationId) {
          this.warnings.push({
            severity: 'warning',
            message: `Missing operationId for ${method.toUpperCase()} ${path}`,
            path: `${path} (${method})`,
          });
        }

        // Check responses
        if (!operation.responses) {
          this.errors.push({
            severity: 'error',
            message: `No responses defined for ${method.toUpperCase()} ${path}`,
            path: `${path} (${method})`,
          });
        } else {
          const responses = operation.responses;
          
          // Check for at least one success response
          const hasSuccessResponse = Object.keys(responses).some(
            (code) => code === '200' || code === '201' || code === '2XX' || code === 'default'
          );

          if (!hasSuccessResponse) {
            this.warnings.push({
              severity: 'warning',
              message: `No success response (200/201/2XX) defined for ${method.toUpperCase()} ${path}`,
              path: `${path} (${method})`,
            });
          }

          // Check for error responses
          const hasErrorResponse = Object.keys(responses).some(
            (code) => 
              code === '400' || code === '401' || code === '403' || 
              code === '404' || code === '500' || code === '4XX' || code === '5XX'
          );

          if (!hasErrorResponse && method !== 'get') {
            this.warnings.push({
              severity: 'warning',
              message: `No error responses (4XX/5XX) defined for ${method.toUpperCase()} ${path}`,
              path: `${path} (${method})`,
            });
          }
        }
      });
    });
  }

  /**
   * Validate paths and operations structure
   */
  private validatePathsAndOperations(): void {
    console.log('✓ Validating paths and operations...');

    const spec = specs as any;
    const paths = spec.paths || {};
    let pathCount = 0;
    let operationCount = 0;

    Object.entries(paths).forEach(([path, pathItem]) => {
      if (!pathItem) return;

      pathCount++;

      // Validate path format
      if (!path.startsWith('/')) {
        this.errors.push({
          severity: 'error',
          message: `Path should start with /: ${path}`,
          path,
        });
      }

      // Count operations
      const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
      methods.forEach((method) => {
        if ((pathItem as any)[method]) {
          operationCount++;
        }
      });

      // Check for path parameters
      const pathParams = path.match(/\{([^}]+)\}/g);
      if (pathParams) {
        pathParams.forEach((param) => {
          const paramName = param.slice(1, -1);
          
          // Check if all methods define this parameter
          const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
          methods.forEach((method) => {
            const operation = (pathItem as any)[method];
            if (operation) {
              const params = operation.parameters || [];
              const hasParam = params.some(
                (p: any) => p.in === 'path' && p.name === paramName
              );

              if (!hasParam) {
                this.warnings.push({
                  severity: 'warning',
                  message: `Path parameter ${paramName} not defined in ${method.toUpperCase()} ${path}`,
                  path: `${path} (${method})`,
                });
              }
            }
          });
        });
      }
    });

    console.log(`  ✓ Found ${pathCount} paths with ${operationCount} operations`);
  }

  /**
   * Report validation results
   */
  private reportResults(): void {
    console.log('\n' + '='.repeat(60));
    console.log('VALIDATION RESULTS');
    console.log('='.repeat(60));

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('\n✅ No issues found! Specification is valid.\n');
      return;
    }

    if (this.errors.length > 0) {
      console.log(`\n❌ ERRORS (${this.errors.length}):`);
      this.errors.forEach((error) => {
        console.log(`   ${error.message}`);
        if (error.path) {
          console.log(`      Path: ${error.path}`);
        }
      });
    }

    if (this.warnings.length > 0) {
      console.log(`\n⚠️  WARNINGS (${this.warnings.length}):`);
      this.warnings.forEach((warning) => {
        console.log(`   ${warning.message}`);
        if (warning.path) {
          console.log(`      Path: ${warning.path}`);
        }
      });
    }

    console.log('\n' + '='.repeat(60));

    if (this.errors.length > 0) {
      console.log(`\n❌ Validation FAILED with ${this.errors.length} error(s)\n`);
    } else {
      console.log(`\n✅ Validation PASSED with ${this.warnings.length} warning(s)\n`);
    }
  }
}

// Main execution
async function main(): Promise<void> {
  const validator = new OpenAPIValidator();
  
  try {
    const isValid = await validator.validate();
    
    if (!isValid) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error during validation:', error);
    process.exit(1);
  }
}

main();
