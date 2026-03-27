#!/usr/bin/env node

/**
 * Route Drift Detection Script
 * 
 * This script compares API routes defined in the backend with API calls made in the frontend
 * to detect potential route drift between frontend and backend.
 * 
 * Usage: node scripts/detect-route-drift.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const BACKEND_ROUTES_DIR = path.join(__dirname, '../fluxapay_backend/src/routes');
const FRONTEND_SRC_DIR = path.join(__dirname, '../fluxapay_frontend/src');
const OUTPUT_FILE = path.join(__dirname, '../route-drift-report.md');

// Critical routes that must exist in both frontend and backend
const CRITICAL_ROUTES = [
  { method: 'POST', path: '/api/v1/merchants', description: 'Merchant registration' },
  { method: 'POST', path: '/api/v1/merchants/login', description: 'Merchant login' },
  { method: 'GET', path: '/api/v1/merchants/me', description: 'Get current merchant' },
  { method: 'POST', path: '/api/v1/payments', description: 'Create payment' },
  { method: 'GET', path: '/api/v1/payments', description: 'List payments' },
  { method: 'POST', path: '/api/v1/refunds', description: 'Create refund' },
  { method: 'GET', path: '/api/v1/refunds', description: 'List refunds' },
  { method: 'POST', path: '/api/v1/merchants/kyc', description: 'Submit KYC' },
  { method: 'GET', path: '/api/v1/dashboard', description: 'Dashboard data' },
  { method: 'GET', path: '/health', description: 'Health check' },
];

/**
 * Extract routes from backend route files
 */
function extractBackendRoutes() {
  const routes = [];
  
  try {
    const files = fs.readdirSync(BACKEND_ROUTES_DIR).filter(f => f.endsWith('.route.ts'));
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(BACKEND_ROUTES_DIR, file), 'utf-8');
      
      // Match router.get/post/put/patch/delete calls
      const routeMatches = content.matchAll(/router\.(get|post|put|patch|delete)\(['"]([^'"]+)['"]/g);
      
      for (const match of routeMatches) {
        const method = match[1].toUpperCase();
        const routePath = match[2];
        routes.push({
          method,
          path: routePath,
          source: file,
        });
      }
    }
  } catch (error) {
    console.error('Error extracting backend routes:', error.message);
  }
  
  return routes;
}

/**
 * Extract API calls from frontend source code
 */
function extractFrontendRoutes() {
  const routes = [];
  const apiPatterns = [
    /fetch\(['"]([^'"]+)['"]/g,
    /axios\.(get|post|put|patch|delete)\(['"]([^'"]+)['"]/g,
    /api\.(get|post|put|patch|delete)\(['"]([^'"]+)['"]/g,
    /\$fetch\(['"]([^'"]+)['"]/g,
  ];
  
  try {
    const findFiles = (dir) => {
      const files = [];
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          files.push(...findFiles(fullPath));
        } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
          files.push(fullPath);
        }
      }
      
      return files;
    };
    
    const tsFiles = findFiles(FRONTEND_SRC_DIR);
    
    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const relativePath = path.relative(FRONTEND_SRC_DIR, file);
      
      for (const pattern of apiPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const method = match[1] ? match[1].toUpperCase() : 'GET';
          const routePath = match[2] || match[1];
          
          // Only include API routes
          if (routePath.includes('/api/')) {
            routes.push({
              method,
              path: routePath,
              source: relativePath,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error extracting frontend routes:', error.message);
  }
  
  return routes;
}

/**
 * Check for route drift
 */
function checkRouteDrift(backendRoutes, frontendRoutes) {
  const drift = {
    missingInBackend: [],
    missingInFrontend: [],
    methodMismatch: [],
    criticalRouteIssues: [],
  };
  
  // Create lookup maps
  const backendMap = new Map();
  backendRoutes.forEach(route => {
    const key = `${route.method}:${route.path}`;
    backendMap.set(key, route);
  });
  
  const frontendMap = new Map();
  frontendRoutes.forEach(route => {
    const key = `${route.method}:${route.path}`;
    frontendMap.set(key, route);
  });
  
  // Check for routes in frontend but not in backend
  frontendRoutes.forEach(route => {
    const key = `${route.method}:${route.path}`;
    if (!backendMap.has(key)) {
      // Check if path exists but method differs
      const pathExistsInBackend = backendRoutes.some(r => r.path === route.path);
      
      if (pathExistsInBackend) {
        drift.methodMismatch.push({
          frontend: route,
          message: `Path exists but method mismatch for ${route.method} ${route.path}`,
        });
      } else {
        drift.missingInBackend.push(route);
      }
    }
  });
  
  // Check for routes in backend but not in frontend (informational)
  backendRoutes.forEach(route => {
    const key = `${route.method}:${route.path}`;
    if (!frontendMap.has(key)) {
      // Only flag if it's a GET endpoint (likely a UI route)
      if (route.method === 'GET' && !route.path.includes('/api-docs')) {
        drift.missingInFrontend.push(route);
      }
    }
  });
  
  // Check critical routes
  CRITICAL_ROUTES.forEach(critical => {
    const key = `${critical.method}:${critical.path}`;
    const existsInBackend = backendMap.has(key);
    const existsInFrontend = frontendMap.has(key);
    
    if (!existsInBackend || !existsInFrontend) {
      drift.criticalRouteIssues.push({
        ...critical,
        existsInBackend,
        existsInFrontend,
      });
    }
  });
  
  return drift;
}

/**
 * Generate markdown report
 */
function generateReport(drift, backendRoutes, frontendRoutes) {
  const lines = [
    '# Route Drift Detection Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `| Metric | Count |`,
    `|--------|-------|`,
    `| Backend Routes | ${backendRoutes.length} |`,
    `| Frontend API Calls | ${frontendRoutes.length} |`,
    `| Missing in Backend | ${drift.missingInBackend.length} |`,
    `| Missing in Frontend | ${drift.missingInFrontend.length} |`,
    `| Method Mismatches | ${drift.methodMismatch.length} |`,
    `| Critical Route Issues | ${drift.criticalRouteIssues.length} |`,
    '',
  ];
  
  // Critical Route Issues
  if (drift.criticalRouteIssues.length > 0) {
    lines.push(
      '## ⚠️ Critical Route Issues',
      '',
      'These routes are required for core functionality but have issues:',
      '',
    );
    
    drift.criticalRouteIssues.forEach(issue => {
      const backendStatus = issue.existsInBackend ? '✅' : '❌';
      const frontendStatus = issue.existsInFrontend ? '✅' : '❌';
      lines.push(
        `- **${issue.method} ${issue.path}** (${issue.description})`,
        `  - Backend: ${backendStatus} ${issue.existsInBackend ? 'Exists' : 'Missing'}`,
        `  - Frontend: ${frontendStatus} ${issue.existsInFrontend ? 'Exists' : 'Missing'}`,
        '',
      );
    });
  } else {
    lines.push('## ✅ Critical Routes', '', 'All critical routes are present in both frontend and backend.', '');
  }
  
  // Missing in Backend
  if (drift.missingInBackend.length > 0) {
    lines.push(
      '## 🚨 Routes Missing in Backend',
      '',
      'These API calls are made by the frontend but not found in backend routes:',
      '',
    );
    
    drift.missingInBackend.forEach(route => {
      lines.push(`- **${route.method} ${route.path}** (called in: ${route.source})`);
    });
    
    lines.push('');
  }
  
  // Missing in Frontend
  if (drift.missingInFrontend.length > 0) {
    lines.push(
      '## ⚠️ Routes Missing in Frontend',
      '',
      'These backend routes are not called by the frontend (may be unused):',
      '',
    );
    
    drift.missingInFrontend.forEach(route => {
      lines.push(`- ${route.method} ${route.path} (defined in: ${route.source})`);
    });
    
    lines.push('');
  }
  
  // Method Mismatches
  if (drift.methodMismatch.length > 0) {
    lines.push(
      '## 🔀 Method Mismatches',
      '',
      'These paths exist but have HTTP method mismatches:',
      '',
    );
    
    drift.methodMismatch.forEach(mismatch => {
      lines.push(`- ${mismatch.message}`);
    });
    
    lines.push('');
  }
  
  // Backend Routes Detail
  lines.push(
    '## 📋 Backend Routes',
    '',
    '```',
    backendRoutes.map(r => `${r.method.padEnd(6)} ${r.path}`).join('\n'),
    '```',
    '',
  );
  
  // Frontend Routes Detail
  lines.push(
    '## 📋 Frontend API Calls',
    '',
    '```',
    frontendRoutes.map(r => `${r.method.padEnd(6)} ${r.path} (${r.source})`).join('\n'),
    '```',
    '',
  );
  
  // Recommendations
  lines.push(
    '## 💡 Recommendations',
    '',
  );
  
  if (drift.criticalRouteIssues.length > 0) {
    lines.push('1. **HIGH PRIORITY**: Fix critical route issues immediately');
  }
  if (drift.missingInBackend.length > 0) {
    lines.push('2. Add missing backend routes or remove frontend calls');
  }
  if (drift.missingInFrontend.length > 0) {
    lines.push('3. Review unused backend routes - consider removing if not needed');
  }
  if (drift.methodMismatch.length > 0) {
    lines.push('4. Fix HTTP method mismatches');
  }
  if (drift.criticalRouteIssues.length === 0 && drift.missingInBackend.length === 0) {
    lines.push('✅ No critical issues found! Routes are in sync.');
  }
  
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Main execution
 */
function main() {
  console.log('🔍 Route Drift Detection\n');
  
  console.log('Extracting backend routes...');
  const backendRoutes = extractBackendRoutes();
  console.log(`   Found ${backendRoutes.length} backend routes`);
  
  console.log('Extracting frontend API calls...');
  const frontendRoutes = extractFrontendRoutes();
  console.log(`   Found ${frontendRoutes.length} frontend API calls`);
  
  console.log('Checking for route drift...');
  const drift = checkRouteDrift(backendRoutes, frontendRoutes);
  
  console.log('Generating report...');
  const report = generateReport(drift, backendRoutes, frontendRoutes);
  
  // Write report to file
  fs.writeFileSync(OUTPUT_FILE, report);
  console.log(`\n📄 Report saved to: ${OUTPUT_FILE}`);
  
  // Print summary
  console.log('\n--- Summary ---');
  console.log(`Backend Routes: ${backendRoutes.length}`);
  console.log(`Frontend API Calls: ${frontendRoutes.length}`);
  console.log(`Critical Issues: ${drift.criticalRouteIssues.length}`);
  console.log(`Missing in Backend: ${drift.missingInBackend.length}`);
  console.log(`Missing in Frontend: ${drift.missingInFrontend.length}`);
  console.log(`Method Mismatches: ${drift.methodMismatch.length}`);
  
  // Exit with error if critical issues found
  if (drift.criticalRouteIssues.length > 0 || drift.missingInBackend.length > 0) {
    console.log('\n❌ Route drift detected! Check the report for details.');
    process.exit(1);
  } else {
    console.log('\n✅ No critical route drift detected!');
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { extractBackendRoutes, extractFrontendRoutes, checkRouteDrift };
