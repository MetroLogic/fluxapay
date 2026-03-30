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

interface RouteInfo {
  method: string;
  path: string;
  file: string;
  line?: number;
  hasSwagger: boolean;
}

class RouteCoverageChecker {
  private routesDir: string;
  private swaggerPaths: Set<string>;
  private documentedRoutes: Map<string, Set<string>>;
  
  constructor(routesDir: string) {
    this.routesDir = routesDir;
    const spec = specs as any;
    this.swaggerPaths = new Set(Object.keys(spec.paths || {}));
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
          // Normalize path parameters
          const normalizedPath = swaggerPath.replace(/\{[^}]+\}/g, '{param}');
          
          if (!map.has(normalizedPath)) {
            map.set(normalizedPath, new Set());
          }
          map.get(normalizedPath)?.add(method.toUpperCase());
        }
      });
    });
    
    return map;
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
              hasSwagger: this.isRouteDocumented(routePath, method.toUpperCase()),
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
  private isRouteDocumented(routePath: string, method: string): boolean {
    // Normalize path parameters for comparison
    const normalizedRoute = routePath.replace(/:[a-zA-Z_]+/g, '{param}');
    
    // Direct match
    if (this.swaggerPaths.has(routePath)) {
      const methods = this.documentedRoutes.get(routePath.replace(/\{[^}]+\}/g, '{param}'));
      return methods?.has(method) ?? false;
    }
    
    // Match with parameter normalization
    const docMethods = this.documentedRoutes.get(normalizedRoute);
    return docMethods?.has(method) ?? false;
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
