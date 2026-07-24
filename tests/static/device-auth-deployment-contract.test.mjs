import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const projectRoot = process.cwd();
const rotationMigration = '20260720150000_complete_device_credential_rotation';
const enumMigration = '20260720140000_add_device_credential_rotation_status_values';
const runtimeEntrypoint = '/app/docker-entrypoint.sh';
const runtimeEntrypointSource = `#!/bin/sh
set -eu

if [ -n "\${DOPPLER_TOKEN:-}" ]; then
  exec doppler run -- node dist/src/main
else
  exec node dist/src/main
fi
`;

function readProjectFile(relativePath) {
  return readFileSync(join(projectRoot, relativePath), 'utf8');
}

test('device-auth deployment contract: CI targets main and codex candidates', () => {
  const workflow = readProjectFile('.github/workflows/ci.yml');

  assert.match(workflow, /push:\s*\r?\n\s*branches:\s*\[main,\s*codex\/\*\*\]/);
  assert.match(workflow, /pull_request:\s*\r?\n\s*branches:\s*\[main\]/);
  assert.doesNotMatch(workflow, /branches:\s*\[master\]/);
});

test('device-auth deployment contract: Docker and Railway share one runtime entrypoint', () => {
  const dockerfile = readProjectFile('webhard-api/Dockerfile');
  const railwayConfig = readProjectFile('webhard-api/railway.toml');
  const command = dockerfile.slice(dockerfile.lastIndexOf('\nCMD ')).trim();
  const railwayStartCommands = railwayConfig.match(/^startCommand\s*=.*$/gm) ?? [];

  assert.match(
    dockerfile,
    /^RUN sed -i 's\/\\r\$\/\/' docker-entrypoint\.sh && chmod \+x docker-entrypoint\.sh$/m
  );
  assert.equal(command, `CMD ["${runtimeEntrypoint}"]`);
  assert.deepEqual(railwayStartCommands, [`startCommand = "${runtimeEntrypoint}"`]);
});

test('device-auth deployment contract: runtime entrypoint injects Doppler without migration', () => {
  const entrypointPath = join(projectRoot, 'webhard-api/docker-entrypoint.sh');

  assert.ok(existsSync(entrypointPath), 'webhard-api/docker-entrypoint.sh must exist');
  const entrypoint = readFileSync(entrypointPath, 'utf8');

  assert.equal(entrypoint, runtimeEntrypointSource);
});

test('device-auth deployment contract: Docker build reserves heap without changing runtime', () => {
  const dockerfile = readProjectFile('webhard-api/Dockerfile');
  const lines = dockerfile.split(/\r?\n/);
  const buildCommands = lines.filter((line) => /\bpnpm build\b/.test(line));
  const nodeOptionsLines = lines.filter((line) => /\bNODE_OPTIONS\b/.test(line));

  assert.deepEqual(buildCommands, ['RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm build']);
  assert.deepEqual(nodeOptionsLines, buildCommands);
  assert.doesNotMatch(dockerfile, /^ENV\s+NODE_OPTIONS(?:=|\s)/im);
  assert.doesNotMatch(dockerfile.slice(dockerfile.lastIndexOf('\nCMD ')), /NODE_OPTIONS/i);
});

test('device-auth deployment contract: enum values commit before later constraints use them', () => {
  const migrationsDirectory = join(projectRoot, 'webhard-api/prisma/migrations');
  const migrationDirectories = readdirSync(migrationsDirectory).sort();

  assert.ok(migrationDirectories.includes(enumMigration));
  assert.ok(
    migrationDirectories.indexOf(enumMigration) < migrationDirectories.indexOf(rotationMigration)
  );

  const enumSource = readProjectFile(
    `webhard-api/prisma/migrations/${enumMigration}/migration.sql`
  );
  const rotationSource = readProjectFile(
    `webhard-api/prisma/migrations/${rotationMigration}/migration.sql`
  );

  assert.match(
    enumSource,
    /ALTER TYPE "DeviceCredentialRotationStatus" ADD VALUE IF NOT EXISTS 'expired';/
  );
  assert.match(
    enumSource,
    /ALTER TYPE "DeviceCredentialRotationStatus" ADD VALUE IF NOT EXISTS 'revoked';/
  );
  assert.doesNotMatch(enumSource, /ALTER TABLE|ADD CONSTRAINT|CREATE INDEX/i);
  assert.doesNotMatch(rotationSource, /ALTER TYPE "DeviceCredentialRotationStatus" ADD VALUE/i);
  assert.match(rotationSource, /"status" <> 'expired' OR "expired_at" IS NOT NULL/);
  assert.match(rotationSource, /"status" <> 'revoked' OR "revoked_at" IS NOT NULL/);
});
