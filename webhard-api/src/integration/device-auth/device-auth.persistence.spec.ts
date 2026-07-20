import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_DIRECTORY = '20260719120000_add_integration_device_credentials';
const TOKEN_EXCHANGE_MIGRATION_DIRECTORY = '20260720100000_add_device_token_exchanges';
const ROTATION_MIGRATION_DIRECTORY = '20260720150000_complete_device_credential_rotation';
const DEVICE_CREDENTIAL_TABLES = [
  'integration_devices',
  'device_enrollments',
  'device_refresh_credentials',
  'device_credential_rotations',
  'device_credential_audit_logs',
];
const DEVICE_CREDENTIAL_METADATA_MODELS = [
  'DeviceEnrollment',
  'DeviceRefreshCredential',
  'DeviceCredentialRotation',
  'DeviceCredentialAuditLog',
];

function readSchema(): string {
  return readFileSync(resolve(__dirname, '../../../prisma/schema.prisma'), 'utf8');
}

function readMigration(): string {
  return readFileSync(
    resolve(__dirname, `../../../prisma/migrations/${MIGRATION_DIRECTORY}/migration.sql`),
    'utf8'
  );
}

function readTokenExchangeMigration(): string {
  return readFileSync(
    resolve(
      __dirname,
      `../../../prisma/migrations/${TOKEN_EXCHANGE_MIGRATION_DIRECTORY}/migration.sql`
    ),
    'utf8'
  );
}

function readRotationMigration(): string {
  return readFileSync(
    resolve(__dirname, `../../../prisma/migrations/${ROTATION_MIGRATION_DIRECTORY}/migration.sql`),
    'utf8'
  );
}

function extractBlock(source: string, declaration: 'model' | 'enum', name: string): string {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${declaration} ${name} {`);
  if (start === -1) {
    throw new Error(`${declaration} not found: ${name}`);
  }

  const end = lines.findIndex((line, index) => index > start && line.trim() === '}');
  if (end === -1) {
    throw new Error(`${declaration} is not closed: ${name}`);
  }

  return lines.slice(start, end + 1).join('\n');
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

describe('device credential persistence foundation (Task2)', () => {
  const schema = readSchema();

  it('declares the additive device control-plane models with versioned hashes only', () => {
    const expectedModels: Array<{ name: string; table: string; snippets: string[] }> = [
      {
        name: 'IntegrationDevice',
        table: 'integration_devices',
        snippets: [
          'environment String @db.VarChar(3)',
          'programType String @map("program_type") @db.VarChar(50)',
          'capabilityProfile String @default("standard") @map("capability_profile") @db.VarChar(20)',
          'status IntegrationDeviceStatus @default(pending_approval)',
          'credentialVersion Int @default(1) @map("credential_version")',
        ],
      },
      {
        name: 'DeviceEnrollment',
        table: 'device_enrollments',
        snippets: [
          'enrollmentCodeHash String @unique @map("enrollment_code_hash") @db.VarChar(128)',
          'hashKeyVersion Int @default(1) @map("hash_key_version")',
          'candidateCredentialHash String? @map("candidate_credential_hash") @db.VarChar(128)',
        ],
      },
      {
        name: 'DeviceRefreshCredential',
        table: 'device_refresh_credentials',
        snippets: [
          'credentialHash String @unique @map("credential_hash") @db.VarChar(128)',
          'hashKeyVersion Int @default(1) @map("hash_key_version")',
          'credentialVersion Int @map("credential_version")',
        ],
      },
      {
        name: 'DeviceCredentialRotation',
        table: 'device_credential_rotations',
        snippets: ['candidateCredentialId String? @unique @map("candidate_credential_id")'],
      },
      {
        name: 'DeviceCredentialAuditLog',
        table: 'device_credential_audit_logs',
        snippets: ['deviceId String @map("device_id")', 'action String @db.VarChar(80)'],
      },
    ];

    for (const expected of expectedModels) {
      const model = normalize(extractBlock(schema, 'model', expected.name));
      expect(model).toContain(`@@map("${expected.table}")`);
      for (const snippet of expected.snippets) {
        expect(model).toContain(normalize(snippet));
      }
    }

    const enrollment = extractBlock(schema, 'model', 'DeviceEnrollment');
    const refreshCredential = extractBlock(schema, 'model', 'DeviceRefreshCredential');
    expect(enrollment).not.toMatch(/\benrollmentCode\s+(?:String|Bytes)\b/);
    expect(enrollment).not.toMatch(/\brefreshCredential\s+(?:String|Bytes)\b/);
    expect(refreshCredential).not.toMatch(/\brefreshCredential\s+(?:String|Bytes)\b/);
  });

  it('keeps heartbeat compatibility while adding a nullable device relation and index', () => {
    const heartbeat = normalize(extractBlock(schema, 'model', 'ProgramHeartbeat'));

    expect(heartbeat).toContain(normalize('deviceId String? @unique @map("device_id")'));
    expect(heartbeat).toContain(
      normalize(
        'device IntegrationDevice? @relation(fields: [deviceId], references: [id], onDelete: SetNull)'
      )
    );
    expect(heartbeat).toContain(normalize('@@unique([programType, instanceName])'));

    const migration = readMigration();
    expect(migration).toContain('ALTER TABLE "program_heartbeats" ADD COLUMN "device_id" TEXT;');
    expect(migration).toContain('"program_heartbeats_device_id_fkey"');
    expect(migration).toContain('ON DELETE SET NULL');
    expect(migration).toContain('CREATE UNIQUE INDEX "program_heartbeats_device_id_key"');
  });

  it('constrains environments, capability profiles, and lifecycle statuses in the migration', () => {
    const migration = readMigration();

    expect(normalize(extractBlock(schema, 'enum', 'IntegrationDeviceStatus'))).toContain(
      normalize('pending_approval active revoked')
    );
    expect(normalize(extractBlock(schema, 'enum', 'DeviceRefreshCredentialStatus'))).toContain(
      normalize('prepared active revoked')
    );
    expect(normalize(extractBlock(schema, 'enum', 'DeviceCredentialRotationStatus'))).toContain(
      normalize('requested prepared acknowledged timed_out cancelled')
    );
    expect(migration).toContain("CHECK (\"environment\" IN ('dev', 'stg', 'prd'))");
    expect(migration).toContain("CHECK (\"capability_profile\" IN ('standard', 'safe_canary'))");
    expect(migration).toContain(
      'CONSTRAINT "device_enrollments_hash_key_version_check" CHECK ("hash_key_version" >= 1)'
    );
    expect(migration).toContain(
      'CONSTRAINT "device_refresh_credentials_hash_key_version_check" CHECK ("hash_key_version" >= 1)'
    );
    expect(migration).toContain('CREATE TYPE "IntegrationDeviceStatus" AS ENUM');
    expect(migration).toContain('CREATE TYPE "DeviceRefreshCredentialStatus" AS ENUM');
    expect(migration).toContain('CREATE TYPE "DeviceCredentialRotationStatus" AS ENUM');
  });

  it('enables row-level security and explicitly denies direct database-role access', () => {
    const migration = readMigration();

    for (const table of DEVICE_CREDENTIAL_TABLES) {
      expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
      expect(migration).toContain(`REVOKE ALL ON TABLE "${table}" FROM PUBLIC;`);
      expect(migration).toContain(`EXECUTE 'REVOKE ALL ON TABLE "${table}" FROM anon';`);
      expect(migration).toContain(`EXECUTE 'REVOKE ALL ON TABLE "${table}" FROM authenticated';`);
    }

    expect(migration).toContain("IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN");
    expect(migration).toContain(
      "IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN"
    );
  });

  it('retains only display-name enrollment matching and no uncontrolled device metadata payload', () => {
    const enrollment = extractBlock(schema, 'model', 'DeviceEnrollment');
    const migration = readMigration();

    expect(normalize(enrollment)).toContain(
      normalize(
        'expectedDisplayNameHash String? @map("expected_display_name_hash") @db.VarChar(128)'
      )
    );
    expect(enrollment).not.toContain('expectedOwnerReferenceHash');
    expect(migration).not.toContain('"expected_owner_reference_hash"');

    for (const modelName of DEVICE_CREDENTIAL_METADATA_MODELS) {
      expect(extractBlock(schema, 'model', modelName)).not.toMatch(/\bmetadata\s+Json\b/);
    }
    expect(migration).not.toMatch(/"metadata"\s+JSONB/i);
  });

  it('stays additive and never persists raw enrollment or refresh credentials', () => {
    const migration = readMigration();

    expect(migration).not.toMatch(/^\s*DROP\s+/im);
    expect(migration).not.toMatch(/^\s*TRUNCATE\s+/im);
    expect(migration).not.toMatch(/^\s*DELETE\s+FROM\s+/im);
    expect(migration).not.toMatch(/^\s*UPDATE\s+/im);
    expect(migration).not.toMatch(/^\s*INSERT\s+INTO\s+/im);
    expect(migration).not.toMatch(/"enrollment_code"\s+(?:TEXT|VARCHAR|JSONB)/i);
    expect(migration).not.toMatch(/"refresh_credential"\s+(?:TEXT|VARCHAR|JSONB)/i);
    expect(migration).not.toMatch(/"refresh_token"\s+(?:TEXT|VARCHAR|JSONB)/i);
  });

  it('keeps device program types schema-free and documents service-layer validation', () => {
    const device = normalize(extractBlock(schema, 'model', 'IntegrationDevice'));

    expect(device).toContain(normalize('programType String @map("program_type") @db.VarChar(50)'));
    expect(schema).toContain(
      'Device program-type allowlisting remains a service-layer concern; the persistence layer intentionally stores a free string.'
    );
  });
});

describe('device token exchange persistence (Task 1)', () => {
  const schema = readSchema();

  it('declares predecessor/successor-bound token exchanges with immutable terminal states', () => {
    const exchange = normalize(extractBlock(schema, 'model', 'DeviceTokenExchange'));
    const device = normalize(extractBlock(schema, 'model', 'IntegrationDevice'));
    const credential = normalize(extractBlock(schema, 'model', 'DeviceRefreshCredential'));

    expect(normalize(extractBlock(schema, 'enum', 'DeviceTokenExchangeStatus'))).toContain(
      normalize('completed revoked expired')
    );
    expect(exchange).toContain(normalize('deviceId String @map("device_id")'));
    expect(exchange).toContain(
      normalize('previousCredentialId String @map("previous_credential_id")')
    );
    expect(exchange).toContain(
      normalize('successorCredentialId String @unique @map("successor_credential_id")')
    );
    expect(exchange).toContain(
      normalize('requestIdDigest String @map("request_id_digest") @db.VarChar(128)')
    );
    expect(exchange).toContain(normalize('credentialVersion Int @map("credential_version")'));
    expect(exchange).toContain(normalize('status DeviceTokenExchangeStatus @default(completed)'));
    expect(exchange).toContain(normalize('completedAt DateTime @map("completed_at")'));
    expect(exchange).toContain(normalize('recoverableUntil DateTime @map("recoverable_until")'));
    expect(exchange).toContain(normalize('revokedAt DateTime? @map("revoked_at")'));
    expect(exchange).toContain(normalize('@@unique([deviceId, requestIdDigest])'));
    expect(exchange).toContain(normalize('@@unique([successorCredentialId, deviceId])'));
    expect(exchange).toContain(normalize('@@index([previousCredentialId, status])'));
    expect(exchange).toContain(normalize('@@index([recoverableUntil])'));
    expect(exchange).toContain(normalize('@@map("device_token_exchanges")'));
    expect(exchange).toContain(
      normalize(
        'previous DeviceRefreshCredential @relation("DeviceTokenExchangePrevious", fields: [previousCredentialId, deviceId], references: [id, deviceId], onDelete: Cascade)'
      )
    );
    expect(exchange).toContain(
      normalize(
        'successor DeviceRefreshCredential @relation("DeviceTokenExchangeSuccessor", fields: [successorCredentialId, deviceId], references: [id, deviceId], onDelete: Cascade)'
      )
    );
    expect(device).toContain(normalize('tokenExchanges DeviceTokenExchange[]'));
    expect(credential).toContain(
      normalize(
        'previousTokenExchanges DeviceTokenExchange[] @relation("DeviceTokenExchangePrevious")'
      )
    );
    expect(credential).toContain(
      normalize(
        'successorTokenExchange DeviceTokenExchange? @relation("DeviceTokenExchangeSuccessor")'
      )
    );
  });

  it('uses additive same-device foreign keys, terminal checks, indexes, and direct-access denials', () => {
    const migration = readTokenExchangeMigration();
    const normalizedMigration = normalize(migration);

    expect(migration).toContain('CREATE TYPE "DeviceTokenExchangeStatus" AS ENUM');
    expect(normalizedMigration).toContain(normalize("'completed', 'revoked', 'expired'"));
    expect(migration).toContain('CREATE TABLE "device_token_exchanges"');
    expect(normalizedMigration).toContain(
      normalize(
        'CONSTRAINT "device_token_exchanges_successor_credential_id_device_id_key" UNIQUE ("successor_credential_id", "device_id")'
      )
    );
    expect(normalizedMigration).toContain(
      normalize(
        'CONSTRAINT "device_token_exchanges_request_id_digest_check" CHECK (char_length("request_id_digest") > 0)'
      )
    );
    expect(normalizedMigration).toContain(
      normalize(
        'CONSTRAINT "device_token_exchanges_credential_version_check" CHECK ("credential_version" >= 1)'
      )
    );
    expect(migration).toContain('CONSTRAINT "device_token_exchanges_terminal_state_check" CHECK');
    expect(normalizedMigration).toContain(
      normalize('"status" = \'completed\' AND "revoked_at" IS NULL')
    );
    expect(normalizedMigration).toContain(
      normalize('"status" = \'revoked\' AND "revoked_at" IS NOT NULL')
    );
    expect(normalizedMigration).toContain(
      normalize('"status" = \'expired\' AND "revoked_at" IS NULL')
    );
    expect(normalizedMigration).toContain(
      normalize(
        'FOREIGN KEY ("previous_credential_id", "device_id") REFERENCES "device_refresh_credentials"("id", "device_id") ON DELETE CASCADE'
      )
    );
    expect(normalizedMigration).toContain(
      normalize(
        'FOREIGN KEY ("successor_credential_id", "device_id") REFERENCES "device_refresh_credentials"("id", "device_id") ON DELETE CASCADE'
      )
    );
    expect(migration).toContain(
      'CREATE INDEX "device_token_exchanges_previous_credential_id_status_idx"'
    );
    expect(migration).toContain('CREATE INDEX "device_token_exchanges_recoverable_until_idx"');
    expect(migration).not.toMatch(
      /CREATE\s+(?:UNIQUE\s+)?INDEX[\s\S]*?WHERE[\s\S]*?(?:now\(\)|CURRENT_TIMESTAMP)/i
    );
    expect(migration).toContain('ALTER TABLE "device_token_exchanges" ENABLE ROW LEVEL SECURITY;');
    expect(migration).toContain('REVOKE ALL ON TABLE "device_token_exchanges" FROM PUBLIC;');
    expect(migration).toContain(
      `EXECUTE 'REVOKE ALL ON TABLE "device_token_exchanges" FROM anon';`
    );
    expect(migration).toContain(
      `EXECUTE 'REVOKE ALL ON TABLE "device_token_exchanges" FROM authenticated';`
    );
    expect(migration).not.toMatch(
      /^\s*(?:DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+|INSERT\s+INTO)\s+/im
    );
  });
});

describe('device credential rotation additive completion', () => {
  const schema = readSchema();

  it('adds the new terminal statuses and nullable legacy-compatible base fields', () => {
    const status = normalize(extractBlock(schema, 'enum', 'DeviceCredentialRotationStatus'));
    const rotation = normalize(extractBlock(schema, 'model', 'DeviceCredentialRotation'));
    const credential = normalize(extractBlock(schema, 'model', 'DeviceRefreshCredential'));

    expect(status).toContain(
      normalize('requested prepared acknowledged timed_out cancelled expired revoked')
    );
    expect(rotation).toContain(
      normalize('baseCredentialVersion Int? @map("base_credential_version")')
    );
    expect(rotation).toContain(
      normalize('predecessorCredentialId String? @map("predecessor_credential_id")')
    );
    expect(rotation).toContain(normalize('expiredAt DateTime? @map("expired_at")'));
    expect(rotation).toContain(normalize('revokedAt DateTime? @map("revoked_at")'));
    expect(rotation).toContain(
      normalize(
        'predecessorCredential DeviceRefreshCredential? @relation("DeviceCredentialRotationPredecessor", fields: [predecessorCredentialId, deviceId], references: [id, deviceId], onDelete: NoAction, onUpdate: NoAction, map: "device_credential_rotations_predecessor_credential_device_fkey")'
      )
    );
    expect(rotation).toContain(
      normalize(
        'candidateCredential DeviceRefreshCredential? @relation("DeviceCredentialRotationCandidate", fields: [candidateCredentialId, deviceId], references: [id, deviceId], onDelete: NoAction, onUpdate: NoAction, map: "device_credential_rotations_candidate_credential_device_fkey")'
      )
    );
    expect(credential).toContain(
      normalize(
        'predecessorRotations DeviceCredentialRotation[] @relation("DeviceCredentialRotationPredecessor")'
      )
    );
  });

  it('uses only additive enum and nullable-column changes without rewriting legacy rows', () => {
    const migration = readRotationMigration();

    expect(migration).toContain(
      `ALTER TYPE "DeviceCredentialRotationStatus" ADD VALUE IF NOT EXISTS 'expired'`
    );
    expect(migration).toContain(
      `ALTER TYPE "DeviceCredentialRotationStatus" ADD VALUE IF NOT EXISTS 'revoked'`
    );
    expect(migration).toContain('ADD COLUMN "base_credential_version" INTEGER');
    expect(migration).toContain('ADD COLUMN "predecessor_credential_id" TEXT');
    expect(migration).toContain('ADD COLUMN "expired_at" TIMESTAMP(3)');
    expect(migration).toContain('ADD COLUMN "revoked_at" TIMESTAMP(3)');
    expect(migration).not.toMatch(
      /^\s*(?:DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+|INSERT\s+INTO)\s+/im
    );
    expect(migration).not.toMatch(/SET\s+"base_credential_version"/i);
    expect(migration).not.toMatch(/SET\s+"predecessor_credential_id"/i);
  });

  it('enforces the null/null legacy discriminator and same-device predecessor relation', () => {
    const migration = normalize(readRotationMigration());

    expect(migration).toContain(
      normalize('CONSTRAINT "device_credential_rotations_base_credential_version_check" CHECK (')
    );
    expect(migration).toContain(
      normalize('"base_credential_version" IS NULL AND "predecessor_credential_id" IS NULL')
    );
    expect(migration).toContain(
      normalize(
        '"base_credential_version" IS NOT NULL AND "base_credential_version" >= 1 AND "predecessor_credential_id" IS NOT NULL'
      )
    );
    expect(migration).toContain(
      normalize(
        'CONSTRAINT "device_credential_rotations_predecessor_credential_device_fkey" FOREIGN KEY ("predecessor_credential_id", "device_id") REFERENCES "device_refresh_credentials"("id", "device_id")'
      )
    );
    expect(migration).toContain(normalize('ON DELETE NO ACTION ON UPDATE NO ACTION'));

    const initialMigration = normalize(readMigration());
    expect(initialMigration).toContain(
      normalize(
        'CONSTRAINT "device_credential_rotations_candidate_credential_device_fkey" FOREIGN KEY ("candidate_credential_id", "device_id") REFERENCES "device_refresh_credentials"("id", "device_id")'
      )
    );
    expect(initialMigration).not.toMatch(
      /device_credential_rotations_candidate_credential_device_fkey[^;]*ON DELETE (?:CASCADE|RESTRICT|SET NULL|SET DEFAULT)/i
    );
    expect(migration).toContain(
      normalize(
        'CONSTRAINT "device_credential_rotations_expired_at_check" CHECK ("status" <> \'expired\' OR "expired_at" IS NOT NULL)'
      )
    );
    expect(migration).toContain(
      normalize(
        'CONSTRAINT "device_credential_rotations_revoked_at_check" CHECK ("status" <> \'revoked\' OR "revoked_at" IS NOT NULL)'
      )
    );
  });

  it('preserves the existing one-live-rotation partial unique index', () => {
    const migration = normalize(readRotationMigration());

    expect(migration).toContain(
      normalize(
        'CREATE UNIQUE INDEX IF NOT EXISTS "device_credential_rotations_one_live_per_device" ON "device_credential_rotations"("device_id") WHERE "status" IN (\'requested\', \'prepared\')'
      )
    );
  });

  it.each([
    { baseCredentialVersion: null, predecessorCredentialId: null, accepted: true },
    {
      baseCredentialVersion: null,
      predecessorCredentialId: 'predecessor',
      accepted: false,
    },
    { baseCredentialVersion: 1, predecessorCredentialId: null, accepted: false },
    {
      baseCredentialVersion: 1,
      predecessorCredentialId: 'predecessor',
      accepted: true,
    },
  ])(
    'base-pair constraint truth table: version=$baseCredentialVersion predecessor=$predecessorCredentialId',
    ({ baseCredentialVersion, predecessorCredentialId, accepted }) => {
      const satisfiesConstraint =
        (baseCredentialVersion === null && predecessorCredentialId === null) ||
        (baseCredentialVersion !== null &&
          baseCredentialVersion >= 1 &&
          predecessorCredentialId !== null);

      expect(satisfiesConstraint).toBe(accepted);
    }
  );

  it('maps the predecessor index to a PostgreSQL-safe identifier shared with the migration', () => {
    const indexName = 'device_credential_rotations_predecessor_status_idx';
    const rotation = normalize(extractBlock(schema, 'model', 'DeviceCredentialRotation'));
    const migration = readRotationMigration();

    expect(indexName.length).toBeLessThanOrEqual(63);
    expect(rotation).toContain(
      normalize(`@@index([predecessorCredentialId, status], map: "${indexName}")`)
    );
    expect(migration).toContain(`CREATE INDEX "${indexName}"`);
    expect(migration).not.toContain(
      'device_credential_rotations_predecessor_credential_id_status_idx'
    );
  });
});
