/**
 * Route Coverage Checker
 * 
 * Compares registered routes in the codebase against documented routes in Swagger spec.
 * Identifies undocumented endpoints that need documentation.
 * 
 * Exit codes:
 * - 0: All routes documented (or only warnings)
 * - 1: Found undocumented routes (when run in CI mode)
 */

import fs from 'fs';
import path from 'path';
import { specs } from '../src/docs/swagger';

/** Must stay in sync with `src/app.ts` mount paths (path after `/api/v1`). */
const ROUTE_FILE_MOUNT_PREFIX: Record<string, string> = {
    'audit.route.ts': '/admin',
    'customer.route.ts': '/customers',
    'dashboard.route.ts': '/dashboard',
    'dataExport.route.ts': '/merchants/export',
    'invoice.route.ts': '/invoices',
    'keys.route.ts': '/keys',
    'kyc.route.ts': '/merchants/kyc',
    'merchant.route.ts': '/merchants',
    'merchantDeletion.route.ts': '/merchants',
    'payment.route.ts': '/payments',
    'reconciliation.route.ts': '/admin/reconciliation',
    'refund.route.ts': '/refunds',
    'settlement.route.ts': '/settlements',
    'settlementBatch.route.ts': '/admin/settlement',
    'sweep.route.ts': '/admin/sweep',
    'webhook.route.ts': '/webhooks',
};

interface RouteInfo {
  method: string;
  path: string;
  file: string;
  line?: number;
  hasSwagger: boolean;
}

class RouteCoverageChecker {
  private routesDir: string;
  private documentedRoutes: Map<string, Set<string>>;
  
  constructor(routesDir: string) {
    this.routesDir = routesDir;
    this.documentedRoutes = this.extractDocumentedRoutes();
  }

  /**
   * Extract documented routes from Swagger spec
   */
  private extractDocumentedRoutes(): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    const spec = specs as any;
    
    Object.entries(spec.paths || {}).forEach(([swaggerPath, pathItem]) => {
      if (!pathItem) return;
      
      const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
      
      methods.forEach((method) => {
        if ((pathItem as any)[method]) {
          // Normalize path parameters (:id and {id} → same key for matching)
          const normalizedPath = this.normalizePathForMatch(swaggerPath);
          
          if (!map.has(normalizedPath)) {
            map.set(normalizedPath, new Set());
          }
          map.get(normalizedPath)?.add(method.toUpperCase());
        }
      });
    });
    
    return map;
  }

  /** Map Express `:param` and OpenAPI `{param}` to a single comparable token. */
  private normalizePathForMatch(p: string): string {
    return p
      .replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, '{param}')
      .replace(/\{[^}]+\}/g, '{param}');
  }

  /** Full documented path as in OpenAPI (includes `/api/v1` prefix). */
  private expressRouteToOpenApiPath(file: string, routePath: string): string {
    const mount = ROUTE_FILE_MOUNT_PREFIX[file] ?? '';
    const suffix = routePath === '/' ? '' : routePath;
    return `/api/v1${mount}${suffix}`;
  }

  /**
   * Parse route files to extract registered routes
   */
  private parseRouteFiles(): RouteInfo[] {
    const routes: RouteInfo[] = [];
    
    try {
      const files = fs.readdirSync(this.routesDir);
      
      files.forEach((file) => {
        if (!file.endsWith('.route.ts')) return;
        
        const filePath = path.join(this.routesDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        
        // Look for router.METHOD patterns
        const routePattern = /router\.(get|post|put|delete|patch|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/g;
        
        lines.forEach((line, index) => {
          let match;
          while ((match = routePattern.exec(line)) !== null) {
            const [, method, routePath] = match;
            
            // Skip comment lines
            if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
            
            routes.push({
              method: method.toUpperCase(),
              path: routePath,
              file: file,
              line: index + 1,
              hasSwagger: this.isRouteDocumented(file, routePath, method.toUpperCase()),
            });
          }
        });
      });
    } catch (error) {
      console.error('Error reading route files:', error);
    }
    
    return routes;
  }

  /**
   * Check if a route is documented in Swagger
   */
  private isRouteDocumented(file: string, routePath: string, method: string): boolean {
    const fullPath = this.expressRouteToOpenApiPath(file, routePath);
    const normalizedFull = this.normalizePathForMatch(fullPath);
    const withoutApiPrefix = fullPath.replace(/^\/api\/v1(?=\/|$)/, '') || '/';
    const normalizedShort = this.normalizePathForMatch(withoutApiPrefix);

    return (
      (this.documentedRoutes.get(normalizedFull)?.has(method) ?? false) ||
      (this.documentedRoutes.get(normalizedShort)?.has(method) ?? false)
    );
  }

  /**
   * Generate coverage report
   */
  generateReport(ciMode: boolean = false): number {
    console.log('📊 OpenAPI Route Coverage Report\n');
    console.log('='.repeat(70));
    
    const routes = this.parseRouteFiles();
    
    const documented = routes.filter((r) => r.hasSwagger);
    const undocumented = routes.filter((r) => !r.hasSwagger);
    
    // Summary statistics
    console.log(`\n📈 SUMMARY:`);
    console.log(`   Total Routes: ${routes.length}`);
    console.log(`   Documented: ${documented.length} (${Math.round((documented.length / routes.length) * 100)}%)`);
    console.log(`   Undocumented: ${undocumented.length} (${Math.round((undocumented.length / routes.length) * 100)}%)`);
    
    if (undocumented.length > 0) {
      console.log(`\n⚠️  UNDOCUMENTED ROUTES (${undocumented.length}):`);
      console.log('-'.repeat(70));
      
      undocumented.forEach((route) => {
        console.log(`   ❌ ${route.method.padEnd(6)} ${route.path}`);
        console.log(`      File: ${route.file}:${route.line}`);
      });
      
      console.log('\n' + '='.repeat(70));
      console.log('\n💡 ACTION REQUIRED:');
      console.log('   Add @swagger JSDoc annotations to the undocumented routes above.');
      console.log('   See documented examples in payment.route.ts or merchant.route.ts\n');
      
      if (ciMode) {
        console.log('❌ CI Check FAILED: Found undocumented routes\n');
        return 1;
      }
    } else {
      console.log('\n✅ All routes are documented!\n');
    }
    
    // Show documented routes by file
    console.log('📋 DOCUMENTATION BY FILE:');
    console.log('-'.repeat(70));
    
    const routesByFile = new Map<string, RouteInfo[]>();
    routes.forEach((route) => {
      const existing = routesByFile.get(route.file) || [];
      existing.push(route);
      routesByFile.set(route.file, existing);
    });
    
    Array.from(routesByFile.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([file, fileRoutes]) => {
        const fileDocumented = fileRoutes.filter((r) => r.hasSwagger).length;
        const status = fileDocumented === fileRoutes.length ? '✅' : '⚠️ ';
        console.log(`\n${status} ${file}`);
        console.log(`   ${fileDocumented}/${fileRoutes.length} routes documented`);
        
        fileRoutes.forEach((route) => {
          const docStatus = route.hasSwagger ? '✓' : '✗';
          console.log(`   ${docStatus} ${route.method} ${route.path}`);
        });
      });
    
    console.log('\n' + '='.repeat(70));
    console.log('\n✨ TIP: Run `npm run validate:openapi` to check for documentation issues\n');
    
    return 0;
  }
}

// Main execution
const routesDir = path.join(__dirname, '../src/routes');
const ciMode = process.argv.includes('--ci') || process.env.CI === 'true';

const checker = new RouteCoverageChecker(routesDir);
const exitCode = checker.generateReport(ciMode);

process.exit(exitCode);
