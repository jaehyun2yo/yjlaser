import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const projectRoot = process.cwd();
const rotationMigration = '20260720150000_complete_device_credential_rotation';
const enumMigration = '20260720140000_add_device_credential_rotation_status_values';

function readProjectFile(relativePath) {
  return readFileSync(join(projectRoot, relativePath), 'utf8');
}

test('device-auth deployment contract: CI targets main and codex candidates', () => {
  const workflow = readProjectFile('.github/workflows/ci.yml');

  assert.match(workflow, /push:\s*\r?\n\s*branches:\s*\[main,\s*codex\/\*\*\]/);
  assert.match(workflow, /pull_request:\s*\r?\n\s*branches:\s*\[main\]/);
  assert.doesNotMatch(workflow, /branches:\s*\[master\]/);
});

test('device-auth deployment contract: Docker starts without a migration', () => {
  const dockerfile = readProjectFile('webhard-api/Dockerfile');
  const command = dockerfile.slice(dockerfile.lastIndexOf('\nCMD ')).trim();

  assert.equal(command, 'CMD ["node", "dist/src/main"]');
  assert.doesNotMatch(command, /migrate|prisma|doppler/i);
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
