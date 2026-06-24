#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const defaultMigrationPath = path.join(
  projectRoot,
  'webhard-api',
  'prisma',
  'migrations',
  '20260624093000_enable_public_table_rls',
  'migration.sql'
);
const readonlySqlPath = path.join(
  projectRoot,
  'docs',
  'security',
  'supabase-security-readonly-check-2026-06-24.sql'
);
const postApplySqlPath = path.join(
  projectRoot,
  'docs',
  'security',
  'supabase-security-postapply-check-2026-06-24.sql'
);
const prismaSchemaPath = path.join(projectRoot, 'webhard-api', 'prisma', 'schema.prisma');

const args = process.argv.slice(2);
const isDraftMode = args.includes('--draft');
const candidateArgIndex = args.indexOf('--candidate');
if (candidateArgIndex >= 0 && !args[candidateArgIndex + 1]) {
  console.error('Missing value for --candidate');
  process.exit(2);
}
const candidatePath =
  candidateArgIndex >= 0
    ? path.resolve(projectRoot, args[candidateArgIndex + 1] || '')
    : defaultMigrationPath;
const candidateLabel = isDraftMode ? 'draft SQL' : 'migration';

const failures = [];

function readRequiredFile(filePath) {
  if (!fs.existsSync(filePath)) {
    failures.push(`Missing required file: ${path.relative(projectRoot, filePath)}`);
    return '';
  }

  return fs.readFileSync(filePath, 'utf8');
}

function extractQuotedValues(content, regex, label) {
  const match = content.match(regex);
  if (!match || !match.groups || !match.groups.body) {
    failures.push(`Could not parse ${label}`);
    return [];
  }

  return Array.from(match.groups.body.matchAll(/'([^']+)'/g))
    .map((m) => m[1])
    .sort((a, b) => a.localeCompare(b));
}

function extractPrismaModelTables(content) {
  return Array.from(content.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g))
    .map((match) => {
      const mappedTable = match[2].match(/@@map\(\s*"([^"]+)"\s*\)/);
      return mappedTable ? mappedTable[1] : match[1];
    })
    .sort((a, b) => a.localeCompare(b));
}

function diffSets(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return Array.from(duplicates).sort((a, b) => a.localeCompare(b));
}

function assertIncludes(content, regex, label) {
  if (!regex.test(content)) {
    failures.push(`Missing expected migration guard: ${label}`);
  }
}

function assertNotIncludes(content, regex, label) {
  if (regex.test(content)) {
    failures.push(`Unexpected risky migration statement: ${label}`);
  }
}

const allowedAuthenticatedGrantPatterns = [
  /^GRANT\s+SELECT\s+ON\s+TABLE\s+public\.mobile_unpriced_dxf_view\s+TO\s+authenticated$/i,
  /^GRANT\s+SELECT\s+ON\s+TABLE\s+public\.mobile_worker_status_view\s+TO\s+authenticated$/i,
  /^GRANT\s+SELECT\s+ON\s+TABLE\s+public\.im_mobile_price_update_requests\s+TO\s+authenticated$/i,
  /^GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.im_create_mobile_price_request\s*\(\s*BIGINT\s*,\s*INTEGER\s*,\s*TEXT\s*,\s*TEXT\s*\)\s+TO\s+authenticated$/i,
];

function normalizeSqlStatement(statement) {
  return statement.replace(/\s+/g, ' ').trim();
}

function assertOnlyAllowlistedApiRoleGrants(content) {
  const stripped = stripSqlComments(content);
  const grantStatements = stripped
    .split(';')
    .map(normalizeSqlStatement)
    .filter((statement) => /^GRANT\b/i.test(statement));

  for (const statement of grantStatements) {
    if (/\bTO\s+anon\b/i.test(statement) || /\banon\s*,|\banon$/i.test(statement)) {
      failures.push(`Unexpected grant to anon: ${statement}`);
      continue;
    }

    if (/\bauthenticated\b/i.test(statement)) {
      const isAllowed = allowedAuthenticatedGrantPatterns.some((pattern) =>
        pattern.test(statement)
      );
      if (!isAllowed) {
        failures.push(`Unexpected non-allowlisted grant to authenticated: ${statement}`);
      }
    }
  }
}

function stripSqlComments(content) {
  return content.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function stripSqlCommentsAndLiterals(content) {
  return stripSqlComments(content)
    .replace(/\$[A-Za-z_][A-Za-z0-9_]*\$[\s\S]*?\$[A-Za-z_][A-Za-z0-9_]*\$/g, "''")
    .replace(/\$\$[\s\S]*?\$\$/g, "''")
    .replace(/'(?:''|[^'])*'/g, "''");
}

function assertSqlIsMetadataOnly(content, label, options = {}) {
  const stripped = stripSqlComments(content);
  const keywordScanContent = stripSqlCommentsAndLiterals(content);
  const statements = stripped
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
  const expectedStatementCount = options.expectedStatementCount || null;

  const mutatingKeywordPattern =
    /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|merge|vacuum|analyze|refresh|lock)\b/i;

  if (mutatingKeywordPattern.test(keywordScanContent)) {
    failures.push(
      `${label} contains a mutating/DDL/privilege keyword after comment/literal stripping`
    );
  }

  if (/\bselect\s+\*/i.test(keywordScanContent)) {
    failures.push(`${label} must not use SELECT *`);
  }

  if (/\b(from|join)\s+public\./i.test(keywordScanContent)) {
    failures.push(`${label} must not query application tables directly with FROM/JOIN public.*`);
  }

  if (
    (expectedStatementCount !== null && statements.length !== expectedStatementCount) ||
    statements.some((statement) => !/^(select|with)\b/i.test(statement))
  ) {
    const countDetail =
      expectedStatementCount === null
        ? `${statements.length} SELECT/WITH metadata statements`
        : `exactly ${expectedStatementCount} SELECT/WITH metadata statements; found ${statements.length}`;
    failures.push(`${label} must contain ${countDetail}`);
  }
}

function listFiles(root, shouldSkipDirectory) {
  if (!fs.existsSync(root)) {
    return [];
  }

  const stat = fs.statSync(root);
  if (stat.isFile()) {
    return [root];
  }

  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(entry.name)) {
        files.push(...listFiles(fullPath, shouldSkipDirectory));
      }
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function lineNumberForIndex(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

const candidateSql = readRequiredFile(candidatePath);
const readonlySql = readRequiredFile(readonlySqlPath);
const postApplySql = readRequiredFile(postApplySqlPath);
const prismaSchema = readRequiredFile(prismaSchemaPath);

assertSqlIsMetadataOnly(readonlySql, 'Read-only SQL', { expectedStatementCount: 6 });
assertSqlIsMetadataOnly(postApplySql, 'Post-apply SQL', { expectedStatementCount: 8 });

const candidateTables = extractQuotedValues(
  candidateSql,
  /table_names\s+text\[\]\s*:=\s*ARRAY\[(?<body>[\s\S]*?)\];/i,
  `${candidateLabel} table_names array`
);
const readonlyExpectedTables = extractQuotedValues(
  readonlySql,
  /with\s+expected\(table_name\)\s+as\s+\(\s*values(?<body>[\s\S]*?)\)\s*select/i,
  'read-only SQL expected table list'
);
const postApplyExpectedTables = extractQuotedValues(
  postApplySql,
  /with\s+expected_target_tables\(table_name\)\s+as\s+\(\s*values(?<body>[\s\S]*?)\)\s*,\s*existing_targets/i,
  'post-apply SQL expected table list'
);
const prismaModelTables = extractPrismaModelTables(prismaSchema);

const missingFromCandidate = diffSets(readonlyExpectedTables, candidateTables);
const extraInCandidate = diffSets(candidateTables, readonlyExpectedTables);
const missingFromPostApplyCheck = diffSets(readonlyExpectedTables, postApplyExpectedTables);
const extraInPostApplyCheck = diffSets(postApplyExpectedTables, readonlyExpectedTables);
const schemaTablesMissingFromCandidate = diffSets(prismaModelTables, candidateTables);
const schemaTablesMissingFromReadonlyCheck = diffSets(prismaModelTables, readonlyExpectedTables);
const schemaTablesMissingFromPostApplyCheck = diffSets(prismaModelTables, postApplyExpectedTables);
const duplicatedCandidateTables = findDuplicates(candidateTables);
const duplicatedReadonlyTables = findDuplicates(readonlyExpectedTables);
const duplicatedPostApplyTables = findDuplicates(postApplyExpectedTables);
const duplicatedPrismaTables = findDuplicates(prismaModelTables);
if (missingFromCandidate.length > 0) {
  failures.push(`Tables missing from ${candidateLabel}: ${missingFromCandidate.join(', ')}`);
}
if (extraInCandidate.length > 0) {
  failures.push(
    `Tables only in ${candidateLabel}, not read-only check: ${extraInCandidate.join(', ')}`
  );
}
if (missingFromPostApplyCheck.length > 0) {
  failures.push(`Tables missing from post-apply check: ${missingFromPostApplyCheck.join(', ')}`);
}
if (extraInPostApplyCheck.length > 0) {
  failures.push(
    `Tables only in post-apply check, not read-only check: ${extraInPostApplyCheck.join(', ')}`
  );
}
if (schemaTablesMissingFromCandidate.length > 0) {
  failures.push(
    `Prisma schema tables missing from ${candidateLabel}: ${schemaTablesMissingFromCandidate.join(', ')}`
  );
}
if (schemaTablesMissingFromReadonlyCheck.length > 0) {
  failures.push(
    `Prisma schema tables missing from read-only check: ${schemaTablesMissingFromReadonlyCheck.join(
      ', '
    )}`
  );
}
if (schemaTablesMissingFromPostApplyCheck.length > 0) {
  failures.push(
    `Prisma schema tables missing from post-apply check: ${schemaTablesMissingFromPostApplyCheck.join(
      ', '
    )}`
  );
}
if (duplicatedCandidateTables.length > 0) {
  failures.push(`Duplicate tables in ${candidateLabel}: ${duplicatedCandidateTables.join(', ')}`);
}
if (duplicatedReadonlyTables.length > 0) {
  failures.push(`Duplicate tables in read-only check: ${duplicatedReadonlyTables.join(', ')}`);
}
if (duplicatedPostApplyTables.length > 0) {
  failures.push(`Duplicate tables in post-apply check: ${duplicatedPostApplyTables.join(', ')}`);
}
if (duplicatedPrismaTables.length > 0) {
  failures.push(`Duplicate Prisma schema table mappings: ${duplicatedPrismaTables.join(', ')}`);
}

assertIncludes(candidateSql, /\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b/i, 'enable RLS');
assertIncludes(
  candidateSql,
  /REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+FROM\s+anon/i,
  'revoke anon table privileges'
);
assertIncludes(
  candidateSql,
  /REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+ALL\s+SEQUENCES\s+IN\s+SCHEMA\s+public\s+FROM\s+anon/i,
  'revoke anon sequence privileges'
);
assertIncludes(
  candidateSql,
  /REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+ALL\s+FUNCTIONS\s+IN\s+SCHEMA\s+public\s+FROM\s+anon/i,
  'revoke anon function privileges'
);
assertIncludes(
  candidateSql,
  /REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+FROM\s+authenticated/i,
  'revoke authenticated table privileges'
);
assertIncludes(
  candidateSql,
  /REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+ALL\s+SEQUENCES\s+IN\s+SCHEMA\s+public\s+FROM\s+authenticated/i,
  'revoke authenticated sequence privileges'
);
assertIncludes(
  candidateSql,
  /REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+ALL\s+FUNCTIONS\s+IN\s+SCHEMA\s+public\s+FROM\s+authenticated/i,
  'revoke authenticated function privileges'
);
assertIncludes(
  candidateSql,
  /REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+ALL\s+FUNCTIONS\s+IN\s+SCHEMA\s+public\s+FROM\s+PUBLIC/i,
  'revoke public function privileges'
);
assertIncludes(
  candidateSql,
  /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+REVOKE\s+ALL\s+ON\s+TABLES\s+FROM\s+anon/i,
  'revoke future anon table privileges'
);
assertIncludes(
  candidateSql,
  /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+REVOKE\s+ALL\s+ON\s+SEQUENCES\s+FROM\s+anon/i,
  'revoke future anon sequence privileges'
);
assertIncludes(
  candidateSql,
  /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+REVOKE\s+ALL\s+ON\s+FUNCTIONS\s+FROM\s+anon/i,
  'revoke future anon function privileges'
);
assertIncludes(
  candidateSql,
  /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+REVOKE\s+ALL\s+ON\s+TABLES\s+FROM\s+authenticated/i,
  'revoke future authenticated table privileges'
);
assertIncludes(
  candidateSql,
  /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+REVOKE\s+ALL\s+ON\s+SEQUENCES\s+FROM\s+authenticated/i,
  'revoke future authenticated sequence privileges'
);
assertIncludes(
  candidateSql,
  /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+REVOKE\s+ALL\s+ON\s+FUNCTIONS\s+FROM\s+authenticated/i,
  'revoke future authenticated function privileges'
);
assertIncludes(
  candidateSql,
  /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+REVOKE\s+ALL\s+ON\s+FUNCTIONS\s+FROM\s+PUBLIC/i,
  'revoke future public function privileges'
);
assertIncludes(
  candidateSql,
  /FOR\s+function_signature\s+IN[\s\S]*?pg_proc[\s\S]*?REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+FUNCTION\s+%s\s+FROM\s+PUBLIC[\s\S]*?REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+FUNCTION\s+%s\s+FROM\s+anon[\s\S]*?REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+FUNCTION\s+%s\s+FROM\s+authenticated/i,
  'explicit per-function API role revoke'
);
assertIncludes(
  candidateSql,
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.im_is_admin\s*\(\s*\)/i,
  'replace im_is_admin guard'
);
assertIncludes(
  candidateSql,
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.im_is_admin\s*\(\s*\)[\s\S]*?SET\s+search_path\s*=\s*public/i,
  'im_is_admin fixed search_path'
);
assertIncludes(
  candidateSql,
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.im_is_admin\s*\(\s*\)[\s\S]*?auth\.role\s*\(\s*\)[\s\S]*?service_role/i,
  'im_is_admin allows service_role'
);
assertIncludes(
  candidateSql,
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.im_is_admin\s*\(\s*\)[\s\S]*?im_get_user_role\s*\(\s*\)\s*=\s*'admin'/i,
  'im_is_admin preserves admin role'
);
assertNotIncludes(candidateSql, /\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i, 'disable RLS');
assertOnlyAllowlistedApiRoleGrants(candidateSql);

const runtimeRoots = [
  path.join(projectRoot, 'src'),
  path.join(projectRoot, 'webhard-api', 'src'),
  path.join(projectRoot, 'package.json'),
  path.join(projectRoot, 'webhard-api', 'package.json'),
];
const skipDirectories = new Set([
  '__tests__',
  'tests',
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'test-results',
]);
const runtimeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']);
const directSupabasePattern =
  /@supabase\/|createSupabase|NEXT_PUBLIC_SUPABASE|SUPABASE_(?:URL|ANON|SERVICE|KEY)|\bsupabase\.(?:from|auth|storage|rpc|channel)\b|postgres_changes|RealtimeChannel|RealtimePostgresChangesPayload/g;

const runtimeFiles = runtimeRoots
  .flatMap((root) => listFiles(root, (name) => skipDirectories.has(name)))
  .filter((filePath) => runtimeExtensions.has(path.extname(filePath)))
  .filter((filePath) => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(path.basename(filePath)));

for (const filePath of runtimeFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(projectRoot, filePath);

  for (const match of content.matchAll(directSupabasePattern)) {
    failures.push(
      `Direct Supabase runtime reference: ${relativePath}:${lineNumberForIndex(
        content,
        match.index || 0
      )}: ${match[0]}`
    );
  }
}

for (const packagePath of [
  path.join(projectRoot, 'package.json'),
  path.join(projectRoot, 'webhard-api', 'package.json'),
]) {
  const relativePath = path.relative(projectRoot, packagePath);
  const pkg = JSON.parse(readRequiredFile(packagePath));
  const dependencies = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.optionalDependencies || {}),
  };
  const supabaseDeps = Object.keys(dependencies).filter((name) => name.startsWith('@supabase/'));
  if (supabaseDeps.length > 0) {
    failures.push(`${relativePath} contains Supabase dependencies: ${supabaseDeps.join(', ')}`);
  }
}

if (failures.length > 0) {
  console.error('Supabase remediation readiness check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Supabase remediation readiness OK: ${candidateTables.length} ${candidateLabel} tables match read-only expected list.`
);
console.log(`Prisma schema table coverage: ${prismaModelTables.length} model tables covered.`);
console.log('Read-only SQL metadata-only guard: OK');
console.log('Post-apply SQL metadata-only guard: OK');
console.log('Supabase direct API runtime references: 0');
console.log(`${isDraftMode ? 'Draft SQL' : 'Migration'} deny-by-default guards: OK`);
