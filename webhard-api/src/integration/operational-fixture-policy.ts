export const OPERATIONAL_FIXTURE_POLICY = {
  apiIntegrationSeedMode: 'prisma-test-helper',
  playwrightE2ESeedMode: 'authorized-nestjs-api-seed',
  localOnlySeedModes: ['service-role-test-helper'],
  runtimeForbiddenSeedModes: [
    'supabase-anon-direct-table-access',
    'supabase-authenticated-direct-table-access',
  ],
} as const;

export type OperationalFixtureSeedMode =
  | typeof OPERATIONAL_FIXTURE_POLICY.apiIntegrationSeedMode
  | typeof OPERATIONAL_FIXTURE_POLICY.playwrightE2ESeedMode
  | (typeof OPERATIONAL_FIXTURE_POLICY.localOnlySeedModes)[number];

export interface OperationalBoundaryFile {
  relativePath: string;
  content: string;
}

export interface OperationalBoundaryViolation {
  relativePath: string;
  lineNumber: number;
  ruleId: string;
  message: string;
  line: string;
}

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function isLocalDatabaseUrl(value: string): boolean {
  try {
    const databaseUrl = new URL(value);
    if (databaseUrl.protocol === 'file:' || databaseUrl.protocol === 'sqlite:') {
      return true;
    }
    return (
      LOCAL_DATABASE_HOSTS.has(databaseUrl.hostname) || databaseUrl.hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

function hasRemoteDatabaseUrl(env: { readonly [key: string]: string | undefined }): boolean {
  return [env.DATABASE_URL, env.DIRECT_URL]
    .filter((value): value is string => Boolean(value))
    .some((value) => !isLocalDatabaseUrl(value));
}

export function assertOperationalFixtureSeedAllowed(
  env: { readonly [key: string]: string | undefined } = process.env
): void {
  const runtimeAllowed =
    env.NODE_ENV === 'test' || env.YJLASER_ALLOW_OPERATIONAL_FIXTURE_SEED === '1';

  if (!runtimeAllowed) {
    throw new Error(
      'Operational workflow fixtures are test-only. Set NODE_ENV=test or YJLASER_ALLOW_OPERATIONAL_FIXTURE_SEED=1 for local/CI setup.'
    );
  }

  if (hasRemoteDatabaseUrl(env)) {
    throw new Error(
      'Operational workflow fixtures require a local test database URL. Remote DATABASE_URL/DIRECT_URL values are blocked.'
    );
  }
}

interface BoundaryRule {
  id: string;
  message: string;
  pattern: RegExp;
}

const DIRECT_SUPABASE_RULES: readonly BoundaryRule[] = [
  {
    id: 'supabase-js-import',
    message: 'Operational workflow files must not import the Supabase browser/client SDK.',
    pattern: /(?:from\s+['"]@supabase\/[^'"]+['"]|require\(['"]@supabase\/[^'"]+['"]\))/,
  },
  {
    id: 'public-supabase-anon-key',
    message: 'Operational workflow files must not depend on Supabase anon public keys.',
    pattern: /\b(?:NEXT_PUBLIC_SUPABASE_(?:URL|ANON_KEY)|SUPABASE_ANON_KEY)\b/,
  },
  {
    id: 'supabase-rest-table-url',
    message: 'Operational workflow files must not call Supabase REST table endpoints directly.',
    pattern: /\/rest\/v1\//,
  },
  {
    id: 'supabase-query-builder',
    message: 'Operational workflow files must not query tables through supabase.from().',
    pattern: /\bsupabase\s*\.\s*from\s*\(/,
  },
];

export function findOperationalBoundaryViolations(
  files: readonly OperationalBoundaryFile[]
): OperationalBoundaryViolation[] {
  return files.flatMap((file) =>
    file.content.split(/\r?\n/).flatMap((line, index) =>
      DIRECT_SUPABASE_RULES.filter((rule) => rule.pattern.test(line)).map((rule) => ({
        relativePath: file.relativePath,
        lineNumber: index + 1,
        ruleId: rule.id,
        message: rule.message,
        line: line.trim(),
      }))
    )
  );
}
