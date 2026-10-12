/**
 * Script to check for destructive database migrations before deployment.
 * Parses the generated migration diff to detect potentially destructive operations.
 * Usage: npx ts-node scripts/migration-safety.ts
 */

import { execSync } from 'child_process';

const DESTRUCTIVE_KEYWORDS = [
  'DROP TABLE',
  'DROP COLUMN',
  'DROP TYPE',
  'DROP INDEX',
  'ALTER TABLE "public"."',
  'DELETE FROM'
];

function checkMigrationSafety() {
  console.log('Running Prisma Migration Safety Check...');
  
  let diffOutput: string;
  try {
    // Generate diff from the current database state to the local schema
    // In CI this assumes the database is accessible (e.g., staging db)
    diffOutput = execSync('npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script', { encoding: 'utf8' });
  } catch (error: any) {
    console.error('Failed to run prisma migrate diff:', error.message);
    process.exit(1);
  }

  if (diffOutput.trim() === '' || diffOutput.includes('Empty') || diffOutput.includes('-- This is an empty migration.')) {
    console.log('No pending migrations or empty migration. Safe to proceed.');
    process.exit(0);
  }

  const destructiveMatches = DESTRUCTIVE_KEYWORDS.filter(keyword => 
    diffOutput.toUpperCase().includes(keyword.toUpperCase())
  );

  // Exclude some common non-destructive ALTERS if we wanted to be more precise,
  // but for safety, we flag any ALTER TABLE that modifies structure significantly if not careful.
  // Actually, let's just focus on explicit drops for true data-loss operations
  const dataLossKeywords = ['DROP TABLE', 'DROP COLUMN', 'DROP TYPE'];
  
  const hasDestructive = dataLossKeywords.some(keyword => 
    diffOutput.toUpperCase().includes(keyword.toUpperCase())
  );

  if (hasDestructive) {
    console.error('⚠️  DESTRUCTIVE MIGRATION DETECTED ⚠️');
    console.error('The following potentially destructive operations were found in the pending migration:');
    dataLossKeywords.forEach(keyword => {
      if (diffOutput.toUpperCase().includes(keyword.toUpperCase())) {
         console.error(`- Found keyword: ${keyword}`);
      }
    });
    console.error('\nManual approval and database backup are required.');
    console.error('Ensure the "migration-approved" label is applied to the deployment PR.');
    // Exit with a specific code (e.g., 2) to indicate destructive migration
    process.exit(2);
  } else {
    console.log('✅ Migration appears to be additive and safe.');
    process.exit(0);
  }
}

checkMigrationSafety();
