import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import {
  OPERATIONAL_FIXTURE_POLICY,
  assertOperationalFixtureSeedAllowed,
  findOperationalBoundaryViolations,
  type OperationalBoundaryFile,
} from '../operational-fixture-policy';

const WEBHARD_API_ROOT = path.resolve(__dirname, '../../..');
const WEBSITE_ROOT = path.resolve(WEBHARD_API_ROOT, '..');
const TEST_UTILS_PATH = path.join(WEBHARD_API_ROOT, 'test', 'helpers', 'test-utils.ts');
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const EXCLUDED_RELATIVE_PATHS = new Set([
  'webhard-api/src/integration/operational-fixture-policy.ts',
  'webhard-api/src/integration/__tests__/operational-security-boundary.spec.ts',
]);

interface ScanTarget {
  absolutePath: string;
  relativePrefix: string;
}

function collectFiles(target: ScanTarget): OperationalBoundaryFile[] {
  if (!existsSync(target.absolutePath)) return [];
  const stats = statSync(target.absolutePath);
  if (stats.isFile()) {
    return SCANNED_EXTENSIONS.has(path.extname(target.absolutePath))
      ? [readBoundaryFile(target.absolutePath, target.relativePrefix)]
      : [];
  }

  return readdirSync(target.absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const childAbsolutePath = path.join(target.absolutePath, entry.name);
    const childRelativePrefix = `${target.relativePrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') {
        return [];
      }
      return collectFiles({
        absolutePath: childAbsolutePath,
        relativePrefix: childRelativePrefix,
      });
    }
    if (!entry.isFile() || !SCANNED_EXTENSIONS.has(path.extname(entry.name))) {
      return [];
    }
    return [readBoundaryFile(childAbsolutePath, childRelativePrefix)];
  });
}

function readBoundaryFile(absolutePath: string, relativePath: string): OperationalBoundaryFile {
  return {
    relativePath: relativePath.replaceAll('\\', '/'),
    content: readFileSync(absolutePath, 'utf8'),
  };
}

function collectOperationalBoundaryFiles(): OperationalBoundaryFile[] {
  const targets: ScanTarget[] = [
    {
      absolutePath: path.join(WEBHARD_API_ROOT, 'src', 'contacts'),
      relativePrefix: 'webhard-api/src/contacts',
    },
    {
      absolutePath: path.join(WEBHARD_API_ROOT, 'src', 'files'),
      relativePrefix: 'webhard-api/src/files',
    },
    {
      absolutePath: path.join(WEBHARD_API_ROOT, 'src', 'integration'),
      relativePrefix: 'webhard-api/src/integration',
    },
    {
      absolutePath: path.join(WEBHARD_API_ROOT, 'test'),
      relativePrefix: 'webhard-api/test',
    },
    {
      absolutePath: path.join(WEBSITE_ROOT, 'e2e'),
      relativePrefix: 'e2e',
    },
  ];

  return targets
    .flatMap(collectFiles)
    .filter((file) => !EXCLUDED_RELATIVE_PATHS.has(file.relativePath));
}

describe('operational data integration security boundary', () => {
  it('fixes the operational fixture seed policy after Supabase RLS hardening', () => {
    expect(OPERATIONAL_FIXTURE_POLICY.apiIntegrationSeedMode).toBe('prisma-test-helper');
    expect(OPERATIONAL_FIXTURE_POLICY.playwrightE2ESeedMode).toBe('authorized-nestjs-api-seed');
    expect(OPERATIONAL_FIXTURE_POLICY.runtimeForbiddenSeedModes).toEqual([
      'supabase-anon-direct-table-access',
      'supabase-authenticated-direct-table-access',
    ]);
    expect(OPERATIONAL_FIXTURE_POLICY.localOnlySeedModes).toContain('service-role-test-helper');

    const testUtils = readFileSync(TEST_UTILS_PATH, 'utf8');
    expect(testUtils).toContain('export async function createOperationalWorkflowFixture');
    expect(testUtils).toContain('prisma.contact.create');
    expect(testUtils).toContain('prisma.webhardFolder.create');
    expect(testUtils).toContain('prisma.webhardFile.create');
    expect(testUtils).toContain('assertOperationalFixtureSeedAllowed();');
    expect(testUtils).toContain('export async function cleanupOperationalWorkflowFixtures');
    expect(testUtils).toContain('assertSafeOperationalFixturePrefix(prefix);');
    expect(testUtils).not.toContain("prefix = 'operational-test-'");
    expect(testUtils).not.toContain('path: { contains: prefix }');
  });

  it('keeps operational fixture helpers test-only by default', () => {
    expect(() => assertOperationalFixtureSeedAllowed({ NODE_ENV: 'test' })).not.toThrow();
    expect(() =>
      assertOperationalFixtureSeedAllowed({ YJLASER_ALLOW_OPERATIONAL_FIXTURE_SEED: '1' })
    ).not.toThrow();
    expect(() =>
      assertOperationalFixtureSeedAllowed({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/yjlaser_test',
      })
    ).not.toThrow();
    expect(() => assertOperationalFixtureSeedAllowed({ NODE_ENV: 'production' })).toThrow(
      /test-only/
    );
    expect(() =>
      assertOperationalFixtureSeedAllowed({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://user:pass@db.supabase.co:5432/postgres',
      })
    ).toThrow(/local test database URL/);
    expect(() =>
      assertOperationalFixtureSeedAllowed({
        NODE_ENV: 'production',
        YJLASER_ALLOW_OPERATIONAL_FIXTURE_SEED: '1',
        DIRECT_URL: 'postgresql://user:pass@db.supabase.co:5432/postgres',
      })
    ).toThrow(/local test database URL/);
  });

  it('blocks Supabase anon/authenticated direct table access in operational workflow files', () => {
    const violations = findOperationalBoundaryViolations(collectOperationalBoundaryFiles());

    expect(violations).toEqual([]);
  });
});
