import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface MigrationFile {
  version: string;
  name: string;
  upPath: string;
  downPath: string;
  upSql: string;
  downSql: string;
}

export interface ValidationIssue {
  file: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Validates migration files for symmetry, transaction hygiene, and syntax invariants.
 */
export async function validateMigrations(migrationsDir: string): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const entries = await readdir(migrationsDir);
  const upFiles = entries.filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql')).sort();

  for (const upFile of upFiles) {
    const downFile = upFile.replace(/\.sql$/, '.down.sql');
    const upPath = join(migrationsDir, upFile);
    const downPath = join(migrationsDir, downFile);

    if (!entries.includes(downFile)) {
      issues.push({
        file: upFile,
        rule: 'migration-symmetry',
        message: `Missing corresponding rollback file: "${downFile}"`,
        severity: 'error',
      });
      continue;
    }

    const upSql = await readFile(upPath, 'utf8');
    const downSql = await readFile(downPath, 'utf8');

    // Rule: Transaction boundaries
    if (!upSql.includes('BEGIN;') || !upSql.includes('COMMIT;')) {
      issues.push({
        file: upFile,
        rule: 'transaction-wrapping',
        message: 'Migration must be wrapped in explicit BEGIN; ... COMMIT; block',
        severity: 'error',
      });
    }

    if (!downSql.includes('BEGIN;') || !downSql.includes('COMMIT;')) {
      issues.push({
        file: downFile,
        rule: 'transaction-wrapping',
        message: 'Rollback must be wrapped in explicit BEGIN; ... COMMIT; block',
        severity: 'error',
      });
    }

    // Rule: Balanced parentheses
    const checkParens = (sql: string, filename: string) => {
      let depth = 0;
      for (const char of sql) {
        if (char === '(') depth++;
        if (char === ')') depth--;
        if (depth < 0) {
          issues.push({
            file: filename,
            rule: 'syntax-parens',
            message: 'Unbalanced closing parenthesis detected',
            severity: 'error',
          });
          break;
        }
      }
      if (depth !== 0) {
        issues.push({
          file: filename,
          rule: 'syntax-parens',
          message: `Unbalanced parentheses: ${depth} unclosed opening parenthesis`,
          severity: 'error',
        });
      }
    };

    checkParens(upSql, upFile);
    checkParens(downSql, downFile);
  }

  return issues;
}

export async function loadMigrations(migrationsDir: string): Promise<MigrationFile[]> {
  const entries = await readdir(migrationsDir);
  const upFiles = entries.filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql')).sort();
  const migrations: MigrationFile[] = [];

  for (const upFile of upFiles) {
    const downFile = upFile.replace(/\.sql$/, '.down.sql');
    const match = upFile.match(/^(\d+)_(.+)\.sql$/);
    const version = match && match[1] ? match[1] : upFile;
    const name = match && match[2] ? match[2] : upFile;

    const upPath = join(migrationsDir, upFile);
    const downPath = join(migrationsDir, downFile);

    const upSql = await readFile(upPath, 'utf8');
    const downSql = entries.includes(downFile) ? await readFile(downPath, 'utf8') : '';

    migrations.push({
      version,
      name,
      upPath,
      downPath,
      upSql,
      downSql,
    });
  }

  return migrations;
}
