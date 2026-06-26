/**
 * Export Swagger/OpenAPI JSON artifact for CI review
 * Writes `swagger.json` to the repository root of the backend working directory.
 */
import fs from 'fs';
import path from 'path';
import { specs } from '../src/docs/swagger';

async function main() {
  const outPath = path.join(process.cwd(), 'swagger.json');
  fs.writeFileSync(outPath, JSON.stringify(specs, null, 2), 'utf-8');
  console.log(`Exported OpenAPI spec to ${outPath}`);
}

main().catch((err) => {
  console.error('Failed to export swagger.json', err);
  process.exit(1);
});
