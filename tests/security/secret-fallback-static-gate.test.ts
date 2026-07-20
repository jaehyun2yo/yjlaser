/**
 * @jest-environment node
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SOURCE_ROOTS = ['src', 'webhard-api/src', 'middleware.ts'];
const IGNORED_DIRECTORY_NAMES = new Set(['.git', '.next', 'coverage', 'dist', 'node_modules']);

const NON_EMPTY_SECRET_ENV_FALLBACK =
  /process\.env\.(?:SESSION_SECRET|SESSION_SECRET_PREVIOUS|MIGRATION_API_KEY|ACCOUNT_RECOVERY_API_KEY|R2_SECRET_ACCESS_KEY|JWT_SECRET)[^\r\n]*(?:\|\||\?\?)[^\r\n]*['"`][^'"`]{6,}['"`]/;

const DEV_ONLY_SECRET_LITERAL = /['"`]change-this-in-production-dev-only['"`]/;
const DEVELOPMENT_RECOVERY_KEY_LITERAL = /['"`]yjlaser-dev-account-recovery-key['"`]/;

function getProductionSourceFiles(): string[] {
  const sourceFiles = SOURCE_ROOTS.flatMap((sourceRoot) => collectSourceFiles(sourceRoot));

  return sourceFiles
    .filter((relativePath) => SOURCE_EXTENSIONS.has(path.extname(relativePath)))
    .filter((relativePath) => !relativePath.includes('/__tests__/'))
    .filter((relativePath) => !relativePath.includes('\\__tests__\\'))
    .filter((relativePath) => !relativePath.endsWith('.test.ts'))
    .filter((relativePath) => !relativePath.endsWith('.spec.ts'))
    .filter((relativePath) => !relativePath.endsWith('.d.ts'));
}

function collectSourceFiles(relativeRoot: string): string[] {
  const absoluteRoot = path.join(REPO_ROOT, relativeRoot);
  const rootStat = statSync(absoluteRoot);
  if (rootStat.isFile()) {
    return [relativeRoot];
  }

  const sourceFiles: string[] = [];
  const visit = (absoluteDirectory: string): void => {
    const entries = readdirSync(absoluteDirectory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name)
    );

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !IGNORED_DIRECTORY_NAMES.has(entry.name)) {
          visit(path.join(absoluteDirectory, entry.name));
        }
        continue;
      }

      if (entry.isFile() && !entry.name.startsWith('.')) {
        sourceFiles.push(path.relative(REPO_ROOT, path.join(absoluteDirectory, entry.name)));
      }
    }
  };

  visit(absoluteRoot);
  return sourceFiles;
}

describe('secret fallback static gate', () => {
  it('does not ship non-empty secret env fallbacks in production source', () => {
    const violations = getProductionSourceFiles().flatMap((relativePath) => {
      const absolutePath = path.join(REPO_ROOT, relativePath);
      return readFileSync(absolutePath, 'utf8')
        .split(/\r?\n/)
        .map((line, index) => ({ line, lineNumber: index + 1 }))
        .filter(({ line }) => NON_EMPTY_SECRET_ENV_FALLBACK.test(line))
        .map(({ line, lineNumber }) => `${relativePath}:${lineNumber}: ${line.trim()}`);
    });

    expect(violations).toEqual([]);
  });

  it('does not ship hardcoded development-only secret literals', () => {
    const violations = getProductionSourceFiles().flatMap((relativePath) => {
      const absolutePath = path.join(REPO_ROOT, relativePath);
      return readFileSync(absolutePath, 'utf8')
        .split(/\r?\n/)
        .map((line, index) => ({ line, lineNumber: index + 1 }))
        .filter(
          ({ line }) =>
            DEV_ONLY_SECRET_LITERAL.test(line) || DEVELOPMENT_RECOVERY_KEY_LITERAL.test(line)
        )
        .map(({ line, lineNumber }) => `${relativePath}:${lineNumber}: ${line.trim()}`);
    });

    expect(violations).toEqual([]);
  });

  it('does not fall back from missing request cookies to the backend API key', () => {
    const coreClient = readFileSync(
      path.join(REPO_ROOT, 'src/lib/api/nestjs/core.client.ts'),
      'utf8'
    );

    expect(coreClient).not.toMatch(/catch\s*\([^)]*\)\s*\{[\s\S]{0,600}X-API-Key/);
    expect(coreClient).not.toContain('API Key fallback');
  });

  it('requires strict session secret handling outside development', () => {
    const edgeSession = readFileSync(path.join(REPO_ROOT, 'src/lib/auth/edge-session.ts'), 'utf8');
    const envUtils = readFileSync(path.join(REPO_ROOT, 'src/lib/utils/env.ts'), 'utf8');

    expect(edgeSession).not.toContain("process.env.NODE_ENV !== 'production'");
    expect(envUtils).toContain('function isStrictRuntime');
    expect(envUtils).toContain('throw new Error(errorMessage)');
  });

  it('has a secret rotation runbook without concrete secret values', () => {
    const runbookPath = path.join(REPO_ROOT, 'docs/security/secret-rotation-runbook.md');

    expect(existsSync(runbookPath)).toBe(true);

    const runbook = readFileSync(runbookPath, 'utf8');
    expect(runbook).not.toMatch(DEV_ONLY_SECRET_LITERAL);
    expect(runbook).not.toMatch(DEVELOPMENT_RECOVERY_KEY_LITERAL);
    expect(runbook).not.toMatch(/sk_live|AKIA|BEGIN PRIVATE KEY|eyJ[a-zA-Z0-9_-]+/);
  });
});
