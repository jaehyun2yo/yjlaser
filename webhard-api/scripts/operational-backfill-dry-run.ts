/**
 * ODATA2-008 operational backfill dry-run.
 *
 * Read-only aggregate report. Does not mutate database rows or external files.
 * Default guard blocks remote/prod-like DATABASE_URL unless explicitly allowed.
 *
 * Usage:
 *   npx tsx scripts/operational-backfill-dry-run.ts --dry-run
 *   npx tsx scripts/operational-backfill-dry-run.ts --dry-run --json
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';
import {
  buildOperationalBackfillDryRunReport,
  classifyDatabaseTarget,
  formatOperationalBackfillDryRunError,
  formatOperationalBackfillDryRunText,
  shouldBlockOperationalDryRun,
} from '../src/integration/operational-backfill-dry-run';

const prisma = new PrismaClient();

function write(line: string): void {
  process.stdout.write(`${line}\n`);
}

function writeError(line: string): void {
  process.stderr.write(`${line}\n`);
}

function printHelp(): void {
  write('Operational backfill dry-run');
  write('');
  write('Usage:');
  write('  npx tsx scripts/operational-backfill-dry-run.ts --dry-run');
  write('  npx tsx scripts/operational-backfill-dry-run.ts --dry-run --json');
  write('');
  write('Remote DB guard: set ALLOW_REMOTE_OPERATIONAL_BACKFILL_DRY_RUN=true only after approval.');
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return 0;
  }

  if (!args.includes('--dry-run')) {
    writeError('Refusing to run: --dry-run is required.');
    printHelp();
    return 2;
  }

  const allowRemote = process.env.ALLOW_REMOTE_OPERATIONAL_BACKFILL_DRY_RUN === 'true';
  if (
    shouldBlockOperationalDryRun({
      databaseUrl: process.env.DATABASE_URL,
      allowRemote,
    })
  ) {
    writeError(
      'Refusing to run against remote-or-unknown DATABASE_URL without ALLOW_REMOTE_OPERATIONAL_BACKFILL_DRY_RUN=true.'
    );
    return 3;
  }

  const report = await buildOperationalBackfillDryRunReport(prisma, {
    databaseTarget: classifyDatabaseTarget(process.env.DATABASE_URL),
    remoteAllowed: allowRemote,
  });

  if (args.includes('--json')) {
    write(JSON.stringify(report, null, 2));
  } else {
    write(formatOperationalBackfillDryRunText(report));
  }

  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    writeError(formatOperationalBackfillDryRunError(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
