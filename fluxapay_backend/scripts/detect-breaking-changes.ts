/**
 * Breaking Change Detector for OpenAPI Specifications
 * 
 * Compares current OpenAPI spec against a reference version (e.g., from main branch)
 * to detect potentially breaking changes:
 * - Removed endpoints
 * - Removed or changed required fields
 * - Changed parameter types
 * - Removed enum values
 * - Changed authentication requirements
 * 
 * Usage:
 *   npm run detect-breaking-changes          # Compare with main branch
 *   npm run detect-breaking-changes --ref=v1.2.0  # Compare with specific tag
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import SwaggerParser from '@apidevtools/swagger-parser';

interface BreakingChange {
  severity: 'critical' | 'major' | 'minor';
  type: string;
  path: string;
  description: string;
  suggestion?: string;
}

interface OpenAPISpec {
  paths: Record<string, any>;
  components?: {
    schemas?: Record<string, any>;
    securitySchemes?: Record<string, any>;
  };
  info: {
    version: string;
  };
}

class BreakingChangeDetector {
  private currentSpec: OpenAPISpec;
  private referenceSpec: OpenAPISpec;
  private changes: BreakingChange[] = [];

  constructor(currentSpecPath: string, referenceSpecPath: string) {
    this.currentSpec = this.loadSpec(currentSpecPath);
    this.referenceSpec = this.loadSpec(referenceSpecPath);
  }

  /**
   * Load and parse OpenAPI specification
   */
  private loadSpec(specPath: string): OpenAPISpec {
    try {
      const content = fs.readFileSync(specPath, 'utf-8');
      const spec = JSON.parse(content);
      return spec;
    } catch (error) {
      throw new Error(`Failed to load spec from ${specPath}: ${error}`);
    }
  }

  /**
   * Detect all breaking changes
   */
  async detectBreakingChanges(): Promise<BreakingChange[]> {
    console.log('🔍 Detecting Breaking Changes...\n');
    console.log(`   Current Version: ${this.currentSpec.info?.version || 'unknown'}`);
    console.log(`   Reference Version: ${this.referenceSpec.info?.version || 'unknown'}\n`);

    // Check for removed endpoints
    this.detectRemovedEndpoints();

    // Check for changed method signatures
    this.detectChangedSignatures();

    // Check for authentication changes
    this.detectAuthChanges();

    // Report results
    this.reportChanges();

    return this.changes;
  }

  /**
   * Detect removed API endpoints
   */
  private detectRemovedEndpoints(): void {
    const currentPaths = Object.keys(this.currentSpec.paths || {});
    const referencePaths = Object.keys(this.referenceSpec.paths || {});

    referencePaths.forEach((refPath) => {
      if (!currentPaths.includes(refPath)) {
        this.changes.push({
          severity: 'critical',
          type: 'endpoint_removed',
          path: refPath,
          description: `Endpoint ${refPath} was removed`,
          suggestion: 'Consider deprecating first or providing migration path',
        });
      }
    });

    // Check for removed methods within existing paths
    currentPaths.forEach((path) => {
      if (referencePaths.includes(path)) {
        const currentMethods = Object.keys(this.currentSpec.paths[path]);
        const referenceMethods = Object.keys(this.referenceSpec.paths[path]);

        referenceMethods.forEach((method) => {
          if (!currentMethods.includes(method) && !['parameters', '$ref'].includes(method)) {
            this.changes.push({
              severity: 'critical',
              type: 'method_removed',
              path: `${method.toUpperCase()} ${path}`,
              description: `HTTP method ${method.toUpperCase()} was removed from ${path}`,
              suggestion: 'Mark as deprecated before removal',
            });
          }
        });
      }
    });
  }

  /**
   * Detect changed request/response signatures
   */
  private detectChangedSignatures(): void {
    Object.entries(this.referenceSpec.paths || {}).forEach(([path, pathItem]) => {
      ['get', 'post', 'put', 'delete', 'patch'].forEach((method) => {
        const referenceOp = pathItem[method];
        const currentOp = this.currentSpec.paths[path]?.[method];

        if (!referenceOp || !currentOp) return;

        // Check for removed required request parameters
        const refParams = referenceOp.parameters || [];
        const currentParams = currentOp.parameters || [];

        refParams.forEach((refParam: any) => {
          const currentParam = currentParams.find(
            (p: any) => p.name === refParam.name && p.in === refParam.in
          );

          if (!currentParam && refParam.required) {
            this.changes.push({
              severity: 'major',
              type: 'required_parameter_removed',
              path: `${method.toUpperCase()} ${path}`,
              description: `Required parameter '${refParam.name}' was removed`,
              suggestion: 'Make parameter optional instead of removing',
            });
          }

          if (currentParam && refParam.schema && currentParam.schema) {
            this.checkTypeChange(
              `${method.toUpperCase()} ${path} parameter ${refParam.name}`,
              refParam.schema,
              currentParam.schema
            );
          }
        });

        // Check for removed required response fields
        this.checkResponseChanges(`${method.toUpperCase()} ${path}`, referenceOp, currentOp);
      });
    });
  }

  /**
   * Check for changes in response schemas
   */
  private checkResponseChanges(operationId: string, referenceOp: any, currentOp: any): void {
    const refResponses = referenceOp.responses || {};
    const currentResponses = currentOp.responses || {};

    // Check success responses
    ['200', '201', '2XX'].forEach((statusCode) => {
      const refResponse = refResponses[statusCode];
      const currentResponse = currentResponses[statusCode];

      if (refResponse && !currentResponse) {
        this.changes.push({
          severity: 'major',
          type: 'response_removed',
          path: operationId,
          description: `Success response (${statusCode}) was removed`,
        });
      }

      if (refResponse?.content && currentResponse?.content) {
        const refSchema = refResponse.content['application/json']?.schema;
        const currentSchema = currentResponse.content['application/json']?.schema;

        if (refSchema && currentSchema) {
          this.checkRequiredFieldsChange(operationId, refSchema, currentSchema);
        }
      }
    });
  }

  /**
   * Check for changes in required fields
   */
  private checkRequiredFieldsChange(
    operationId: string,
    refSchema: any,
    currentSchema: any
  ): void {
    const refRequired = refSchema.required || [];
    const currentRequired = currentSchema.required || [];

    // Check for newly required fields (breaking for clients)
    refRequired.forEach((field: string) => {
      if (!currentRequired.includes(field)) {
        this.changes.push({
          severity: 'minor',
          type: 'field_made_optional',
          path: operationId,
          description: `Field '${field}' is no longer required in response`,
        });
      }
    });

    // Check for removed fields
    const refProperties = Object.keys(refSchema.properties || {});
    const currentProperties = Object.keys(currentSchema.properties || {});

    refProperties.forEach((prop) => {
      if (!currentProperties.includes(prop)) {
        this.changes.push({
          severity: 'major',
          type: 'field_removed',
          path: operationId,
          description: `Field '${prop}' was removed from response`,
          suggestion: 'Deprecate field before removal',
        });
      }
    });
  }

  /**
   * Check for type changes
   */
  private checkTypeChange(context: string, refType: any, currentType: any): void {
    if (!refType || !currentType) return;

    const refTypeStr = JSON.stringify(refType);
    const currentTypeStr = JSON.stringify(currentType);

    if (refTypeStr !== currentTypeStr) {
      // Check for fundamental type changes
      if (refType.type !== currentType.type) {
        this.changes.push({
          severity: 'major',
          type: 'type_changed',
          path: context,
          description: `Type changed from ${refType.type} to ${currentType.type}`,
          suggestion: 'This may break client integrations',
        });
      }

      // Check for enum value removals
      if (refType.enum && currentType.enum) {
        const removedValues = refType.enum.filter((v: any) => !currentType.enum.includes(v));
        if (removedValues.length > 0) {
          this.changes.push({
            severity: 'major',
            type: 'enum_values_removed',
            path: context,
            description: `Enum values removed: ${removedValues.join(', ')}`,
          });
        }
      }
    }
  }

  /**
   * Detect authentication requirement changes
   */
  private detectAuthChanges(): void {
    const refComponents = this.referenceSpec.components;
    const currentComponents = this.currentSpec.components;

    if (refComponents?.securitySchemes && !currentComponents?.securitySchemes) {
      this.changes.push({
        severity: 'critical',
        type: 'auth_removed',
        path: 'Global',
        description: 'Authentication schemes were removed',
      });
    }

    // Check individual endpoint auth changes
    Object.entries(this.referenceSpec.paths || {}).forEach(([path, pathItem]) => {
      ['get', 'post', 'put', 'delete', 'patch'].forEach((method) => {
        const refOp = pathItem[method];
        const currentOp = this.currentSpec.paths[path]?.[method];

        if (!refOp || !currentOp) return;

        const refSecurity = refOp.security;
        const currentSecurity = currentOp.security;

        if (refSecurity && !currentSecurity) {
          this.changes.push({
            severity: 'critical',
            type: 'auth_requirement_removed',
            path: `${method.toUpperCase()} ${path}`,
            description: 'Authentication requirement was removed',
            suggestion: 'Ensure this is intentional - may expose sensitive data',
          });
        } else if (!refSecurity && currentSecurity) {
          this.changes.push({
            severity: 'major',
            type: 'auth_requirement_added',
            path: `${method.toUpperCase()} ${path}`,
            description: 'Authentication requirement was added',
            suggestion: 'Document migration path for existing users',
          });
        }
      });
    });
  }

  /**
   * Report detected changes
   */
  private reportChanges(): void {
    console.log('='.repeat(70));
    console.log('BREAKING CHANGE ANALYSIS RESULTS');
    console.log('='.repeat(70));

    if (this.changes.length === 0) {
      console.log('\n✅ No breaking changes detected!\n');
      return;
    }

    const critical = this.changes.filter((c) => c.severity === 'critical');
    const major = this.changes.filter((c) => c.severity === 'major');
    const minor = this.changes.filter((c) => c.severity === 'minor');

    if (critical.length > 0) {
      console.log(`\n🚨 CRITICAL (${critical.length}):`);
      critical.forEach((change) => {
        console.log(`   ❌ ${change.description}`);
        console.log(`      Path: ${change.path}`);
        if (change.suggestion) {
          console.log(`      💡 ${change.suggestion}`);
        }
      });
    }

    if (major.length > 0) {
      console.log(`\n⚠️  MAJOR (${major.length}):`);
      major.forEach((change) => {
        console.log(`   ⚠️  ${change.description}`);
        console.log(`      Path: ${change.path}`);
        if (change.suggestion) {
          console.log(`      💡 ${change.suggestion}`);
        }
      });
    }

    if (minor.length > 0) {
      console.log(`\nℹ️  MINOR (${minor.length}):`);
      minor.forEach((change) => {
        console.log(`   ℹ️  ${change.description}`);
        console.log(`      Path: ${change.path}`);
      });
    }

    console.log('\n' + '='.repeat(70));
    console.log(`\nSummary: ${critical.length} critical, ${major.length} major, ${minor.length} minor\n`);

    if (critical.length > 0) {
      console.log('❌ BREAKING CHANGES DETECTED - Review required before merge\n');
    } else if (major.length > 0) {
      console.log('⚠️  POTENTIALLY BREAKING CHANGES - Consider version bump\n');
    } else {
      console.log('✅ Only minor changes detected\n');
    }
  }
}

// Main execution
async function main(): Promise<void> {
  const refBranch = process.argv.find((arg) => arg.startsWith('--ref='))?.split('=')[1] || 'main';
  const tempDir = path.join(__dirname, '../.tmp');
  
  try {
    // Create temp directory
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    console.log(`📥 Fetching reference spec from branch: ${refBranch}\n`);

    // Get current spec path (generated at runtime)
    const currentSpecPath = path.join(__dirname, '../swagger.json');
    
    // Export current spec
    const { specs } = require('../src/docs/swagger');
    fs.writeFileSync(currentSpecPath, JSON.stringify(specs, null, 2));

    // Get reference spec from git
    const referenceSpecPath = path.join(tempDir, 'swagger-reference.json');
    execSync(`git show origin/${refBranch}:fluxapay_backend/src/docs/swagger.ts`, {
      stdio: 'pipe',
    });

    // For now, just compare with a placeholder
    // In production, you'd parse the TS file or generate JSON
    console.log('⚠️  Note: Full comparison requires generating spec from both branches');
    console.log('   For now, checking current spec validity only.\n');

    // Just validate current spec
    await SwaggerParser.validate(specs);
    console.log('✅ Current spec is valid\n');

    // Clean up
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  } catch (error) {
    console.error('Error detecting breaking changes:', error);
    process.exit(1);
  }
}

main();
