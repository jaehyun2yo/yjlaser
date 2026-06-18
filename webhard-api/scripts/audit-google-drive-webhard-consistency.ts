/**
 * Audit and optionally remove invalid Google Drive-backed webhard metadata.
 *
 * Usage:
 *   npx tsx scripts/audit-google-drive-webhard-consistency.ts
 *   npx tsx scripts/audit-google-drive-webhard-consistency.ts --apply
 */
import { PrismaClient, StorageProvider } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

const write = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

async function getInvalidState() {
  const [foldersMissingId, filesMissingId, duplicateRootGroups] = await Promise.all([
    prisma.webhardFolder.findMany({
      where: {
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFolderId: null,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        parentId: true,
        companyId: true,
        path: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.webhardFile.findMany({
      where: {
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFileId: null,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        folderId: true,
        companyId: true,
        path: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.webhardFolder.groupBy({
      by: ['companyId'],
      where: {
        companyId: { not: null },
        parentId: null,
        deletedAt: null,
      },
      _count: { _all: true },
      having: {
        companyId: {
          _count: {
            gt: 1,
          },
        },
      },
    }),
  ]);

  const duplicateRoots = await Promise.all(
    duplicateRootGroups.map(async (group) => ({
      companyId: group.companyId,
      count: group._count._all,
      roots: await prisma.webhardFolder.findMany({
        where: {
          companyId: group.companyId,
          parentId: null,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          storageProvider: true,
          driveFolderId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    }))
  );

  return { foldersMissingId, filesMissingId, duplicateRoots };
}

async function removeInvalidGoogleDriveRows(): Promise<void> {
  await prisma.$transaction([
    prisma.webhardFile.deleteMany({
      where: {
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFileId: null,
      },
    }),
    prisma.webhardFile.updateMany({
      where: {
        folder: {
          is: {
            storageProvider: StorageProvider.GOOGLE_DRIVE,
            driveFolderId: null,
          },
        },
      },
      data: { folderId: null },
    }),
    prisma.webhardFolder.deleteMany({
      where: {
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFolderId: null,
      },
    }),
  ]);
}

async function main(): Promise<void> {
  const before = await getInvalidState();
  write('Google Drive webhard consistency audit');
  write(`mode: ${apply ? 'apply' : 'dry-run'}`);
  write(`active Google Drive folders missing driveFolderId: ${before.foldersMissingId.length}`);
  write(`active Google Drive files missing driveFileId: ${before.filesMissingId.length}`);
  write(`companies with multiple active root folders: ${before.duplicateRoots.length}`);
  write(JSON.stringify(before, null, 2));

  if (!apply) {
    write('No data changed. Re-run with --apply to remove invalid Google Drive metadata rows.');
    return;
  }

  await removeInvalidGoogleDriveRows();
  const after = await getInvalidState();
  write('Cleanup complete.');
  write(`active Google Drive folders missing driveFolderId: ${after.foldersMissingId.length}`);
  write(`active Google Drive files missing driveFileId: ${after.filesMissingId.length}`);
  write(`companies with multiple active root folders: ${after.duplicateRoots.length}`);
  write(JSON.stringify(after, null, 2));
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
