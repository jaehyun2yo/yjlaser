/**
 * Dry-run report for non-portfolio R2 objects after Drive migration.
 *
 * This script does not delete R2 objects or mutate the database. It only scans
 * database references that are outside the Portfolio model and prints unique R2
 * object keys that can be reviewed before a separate approved deletion run.
 *
 * Usage:
 *   npx tsx scripts/dry-run-non-portfolio-r2-delete.ts
 *   npx tsx scripts/dry-run-non-portfolio-r2-delete.ts --json
 */
import { PrismaClient, StorageProvider } from '@prisma/client';
import { extractR2Key } from '../src/common/r2-key.util';
import { parseStorageReference } from '../src/storage/storage-reference.util';

const prisma = new PrismaClient();
const jsonMode = process.argv.includes('--json');
const helpMode = process.argv.includes('--help') || process.argv.includes('-h');

interface R2Reference {
  source: string;
  recordId: string;
  field: string;
  key: string;
  note?: string;
}

interface R2Report {
  generatedAt: string;
  mode: 'dry-run';
  excluded: string[];
  totalReferences: number;
  uniqueObjectCount: number;
  references: R2Reference[];
  uniqueObjects: Array<{ key: string; referenceCount: number; sources: string[] }>;
}

type JsonRecord = Record<string, unknown>;

function write(line: string): void {
  process.stdout.write(`${line}\n`);
}

function printHelp(): void {
  write('Dry-run non-portfolio R2 delete candidate report');
  write('');
  write('Usage:');
  write('  npx tsx scripts/dry-run-non-portfolio-r2-delete.ts');
  write('  npx tsx scripts/dry-run-non-portfolio-r2-delete.ts --json');
  write('');
  write('No R2 object or database row is deleted by this script.');
}

function normalizeR2Key(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  const reference = parseStorageReference(raw);
  if (reference.provider !== StorageProvider.R2) return null;

  const key = extractR2Key(reference.idOrKey).trim();
  if (!key) return null;

  return key;
}

function collectFromString(
  references: R2Reference[],
  source: string,
  recordId: string,
  field: string,
  value: string | null | undefined,
  note?: string
): void {
  const key = normalizeR2Key(value);
  if (!key) return;
  references.push({ source, recordId, field, key, note });
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function collectFromJson(
  references: R2Reference[],
  source: string,
  recordId: string,
  field: string,
  value: unknown
): void {
  if (typeof value === 'string') {
    collectFromString(references, source, recordId, field, value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectFromJson(references, source, recordId, `${field}[${index}]`, item);
    });
    return;
  }

  if (!isRecord(value)) return;

  for (const [key, nestedValue] of Object.entries(value)) {
    const nestedField = `${field}.${key}`;
    if (typeof nestedValue === 'string') {
      collectFromString(references, source, recordId, nestedField, nestedValue);
    } else {
      collectFromJson(references, source, recordId, nestedField, nestedValue);
    }
  }
}

function parseJsonString(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

async function collectReferences(): Promise<R2Reference[]> {
  const references: R2Reference[] = [];

  const [contacts, revisions, companies, webhardFiles, nestingTasks, shareLinks, backupLogs] =
    await Promise.all([
      prisma.contact.findMany({
        select: {
          id: true,
          attachmentUrl: true,
          drawingFileUrl: true,
          referencePhotosUrls: true,
          deliveryProofImage: true,
          deliveryCompleteImage: true,
          revisionRequestFileUrl: true,
          revisionRequestHistory: true,
        },
      }),
      prisma.drawingRevision.findMany({
        select: {
          id: true,
          files: true,
        },
      }),
      prisma.company.findMany({
        select: {
          id: true,
          businessRegistrationFileUrl: true,
        },
      }),
      prisma.webhardFile.findMany({
        where: { storageProvider: StorageProvider.R2 },
        select: {
          id: true,
          path: true,
          name: true,
          deletedAt: true,
        },
      }),
      prisma.nestingTask.findMany({
        select: {
          id: true,
          dxfFileUrls: true,
        },
      }),
      prisma.shareLink.findMany({
        select: {
          id: true,
          filePath: true,
          webhardFileId: true,
        },
      }),
      prisma.backupLog.findMany({
        select: {
          id: true,
          r2Key: true,
          fileId: true,
          status: true,
        },
      }),
    ]);

  for (const contact of contacts) {
    collectFromString(references, 'Contact', contact.id, 'attachmentUrl', contact.attachmentUrl);
    collectFromString(references, 'Contact', contact.id, 'drawingFileUrl', contact.drawingFileUrl);
    collectFromJson(
      references,
      'Contact',
      contact.id,
      'referencePhotosUrls',
      parseJsonString(contact.referencePhotosUrls)
    );
    collectFromString(
      references,
      'Contact',
      contact.id,
      'deliveryProofImage',
      contact.deliveryProofImage
    );
    collectFromString(
      references,
      'Contact',
      contact.id,
      'deliveryCompleteImage',
      contact.deliveryCompleteImage
    );
    collectFromString(
      references,
      'Contact',
      contact.id,
      'revisionRequestFileUrl',
      contact.revisionRequestFileUrl
    );
    collectFromJson(
      references,
      'Contact',
      contact.id,
      'revisionRequestHistory',
      contact.revisionRequestHistory
    );
  }

  for (const revision of revisions) {
    collectFromJson(references, 'DrawingRevision', revision.id, 'files', revision.files);
  }

  for (const company of companies) {
    collectFromString(
      references,
      'Company',
      String(company.id),
      'businessRegistrationFileUrl',
      company.businessRegistrationFileUrl
    );
  }

  for (const file of webhardFiles) {
    collectFromString(
      references,
      'WebhardFile',
      file.id,
      'path',
      file.path,
      file.deletedAt ? `deletedAt=${file.deletedAt.toISOString()}` : `name=${file.name}`
    );
  }

  for (const task of nestingTasks) {
    collectFromJson(references, 'NestingTask', task.id, 'dxfFileUrls', task.dxfFileUrls);
  }

  for (const link of shareLinks) {
    collectFromString(
      references,
      'ShareLink',
      link.id,
      'filePath',
      link.filePath,
      link.webhardFileId ? `webhardFileId=${link.webhardFileId}` : undefined
    );
  }

  for (const log of backupLogs) {
    collectFromString(
      references,
      'BackupLog',
      log.id,
      'r2Key',
      log.r2Key,
      `fileId=${log.fileId}, status=${log.status}`
    );
  }

  return references;
}

function buildReport(references: R2Reference[]): R2Report {
  const byKey = new Map<string, R2Reference[]>();
  for (const reference of references) {
    const items = byKey.get(reference.key) ?? [];
    items.push(reference);
    byKey.set(reference.key, items);
  }

  const uniqueObjects = Array.from(byKey.entries())
    .map(([key, refs]) => ({
      key,
      referenceCount: refs.length,
      sources: Array.from(new Set(refs.map((ref) => `${ref.source}.${ref.field}`))).sort(),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    generatedAt: new Date().toISOString(),
    mode: 'dry-run',
    excluded: ['Portfolio.images', 'Contact.portfolioReferenceImage', 'Contact.portfolioReferenceUrl'],
    totalReferences: references.length,
    uniqueObjectCount: uniqueObjects.length,
    references: references.sort((a, b) => a.key.localeCompare(b.key)),
    uniqueObjects,
  };
}

function printTextReport(report: R2Report): void {
  write('Non-portfolio R2 delete candidates');
  write(`mode: ${report.mode}`);
  write(`generatedAt: ${report.generatedAt}`);
  write(`totalReferences: ${report.totalReferences}`);
  write(`uniqueObjectCount: ${report.uniqueObjectCount}`);
  write(`excluded: ${report.excluded.join(', ')}`);
  write('');

  if (report.uniqueObjects.length === 0) {
    write('No non-portfolio R2 candidates found.');
    return;
  }

  write('Unique objects:');
  for (const item of report.uniqueObjects) {
    write(`- ${item.key} (${item.referenceCount} refs: ${item.sources.join(', ')})`);
  }
  write('');
  write('References:');
  for (const ref of report.references) {
    write(
      `- ${ref.key} <- ${ref.source}#${ref.recordId}.${ref.field}${ref.note ? ` (${ref.note})` : ''}`
    );
  }
  write('');
  write('No data changed. Review this list before any separate R2 deletion command.');
}

async function main(): Promise<void> {
  if (helpMode) {
    printHelp();
    return;
  }

  const references = await collectReferences();
  const report = buildReport(references);

  if (jsonMode) {
    write(JSON.stringify(report, null, 2));
    return;
  }

  printTextReport(report);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
