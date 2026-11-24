import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateMigrations, loadMigrations } from './validator.js';
import { DatabaseMigrator } from './migrator.js';
import { createDatabasePool } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const migrationsDir = join(__dirname, '../migrations');

async function main() {
  const command = process.argv[2] || 'validate';

  if (command === 'validate') {
    console.log(`[database] Validating migrations in ${migrationsDir}...`);
    const issues = await validateMigrations(migrationsDir);
    if (issues.length > 0) {
      console.error(`[database] Found ${issues.length} migration issue(s):`);
      for (const issue of issues) {
        console.error(`  [${issue.severity.toUpperCase()}] ${issue.file} (${issue.rule}): ${issue.message}`);
      }
      process.exit(1);
    }
    console.log('[database] All migrations are valid and symmetrical.');
    return;
  }

  const pool = createDatabasePool();
  try {
    const migrations = await loadMigrations(migrationsDir);
    const migrator = new DatabaseMigrator(pool, migrations);

    if (command === 'up') {
      const applied = await migrator.up();
      console.log(`[database] Successfully applied ${applied.length} migration(s):`, applied);
    } else if (command === 'down') {
      const rolledBack = await migrator.down();
      console.log(`[database] Rolled back migration: ${rolledBack ?? 'None'}`);
    } else {
      console.error(`Unknown command: ${command}`);
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === __filename) {
  main().catch((err) => {
    console.error('[database] Migration error:', err);
    process.exit(1);
  });
}
