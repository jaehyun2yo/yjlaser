#!/usr/bin/env node

const projectRef = process.env.SUPABASE_PROJECT_REF || 'ibsbcuumkdhwesrpaqeb';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN || '';
const apiBase = process.env.SUPABASE_MANAGEMENT_API_URL || 'https://api.supabase.com';
const allowMissingToken = process.argv.includes('--allow-missing-token');

const targetLintNames = new Set(['rls_disabled_in_public', 'sensitive_columns_exposed']);

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function summarizeLint(lint) {
  const title = typeof lint.title === 'string' ? lint.title : '';
  const level = typeof lint.level === 'string' ? lint.level : '';
  const name = typeof lint.name === 'string' ? lint.name : 'unknown';
  const metadata = lint.metadata && typeof lint.metadata === 'object' ? lint.metadata : {};
  const entity = [metadata.schema, metadata.name || metadata.entity, metadata.type]
    .filter((part) => typeof part === 'string' && part.trim())
    .join('.');

  return [name, level, title, entity ? `entity=${entity}` : 'entity=unreported']
    .filter(Boolean)
    .join(' | ');
}

async function main() {
  if (!accessToken) {
    const message =
      'SUPABASE_ACCESS_TOKEN is not set; skipping Supabase Management API advisor check.';
    if (allowMissingToken) {
      console.warn(message);
      return;
    }
    fail(`${message} Re-run with a token that has advisors_read/database:read access.`, 2);
  }

  const url = `${apiBase.replace(/\/$/, '')}/v1/projects/${encodeURIComponent(
    projectRef
  )}/advisors/security`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (response.status === 401 || response.status === 403) {
    fail(
      `Supabase advisor check unauthorized (${response.status}). Token must allow advisors_read/database:read.`,
      2
    );
  }

  if (!response.ok) {
    fail(`Supabase advisor check failed with HTTP ${response.status}.`, 2);
  }

  const payload = await response.json();
  const lints = Array.isArray(payload.lints) ? payload.lints : [];
  const targetLints = lints.filter((lint) => targetLintNames.has(lint.name));

  if (targetLints.length > 0) {
    console.error('Supabase critical advisor lints still present:');
    for (const lint of targetLints) {
      console.error(`- ${summarizeLint(lint)}`);
    }
    process.exit(1);
  }

  console.log(`Supabase advisor OK: target critical lints absent for project ${projectRef}.`);
}

main().catch((error) => {
  fail(`Supabase advisor check failed: ${error.message}`, 2);
});
