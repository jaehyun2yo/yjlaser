/**
 * Targeted cleanup for Google Drive webhard E2E data.
 *
 * Usage:
 *   npx tsx scripts/cleanup-e2e-google-drive-webhard.ts
 *   npx tsx scripts/cleanup-e2e-google-drive-webhard.ts --apply
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';

const E2E_COMPANY_PREFIX = 'E2E-GDrive-';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const skipDrive = process.argv.includes('--skip-drive');

for (const envPath of ['../.env.local', '../.env', '.env.local', '.env']) {
  dotenv.config({ path: path.resolve(process.cwd(), envPath) });
}

type E2EFolder = {
  id: string;
  parentId: string | null;
  driveFolderId: string | null;
};

function write(line: string): void {
  process.stdout.write(`${line}\n`);
}

function toBigIntIds(ids: number[]): bigint[] {
  return ids.map((id) => BigInt(id));
}

function getExternalErrorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const maybeError = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  const status = maybeError.code ?? maybeError.status ?? maybeError.response?.status;
  return typeof status === 'number' ? status : null;
}

function folderDepth(folder: E2EFolder, foldersById: Map<string, E2EFolder>): number {
  let depth = 0;
  let current = folder;
  const seen = new Set<string>([folder.id]);

  while (current.parentId && foldersById.has(current.parentId) && !seen.has(current.parentId)) {
    depth += 1;
    current = foldersById.get(current.parentId)!;
    seen.add(current.id);
  }

  return depth;
}

async function deleteDriveItems(input: {
  fileIds: string[];
  folders: E2EFolder[];
}): Promise<{ deletedFiles: number; deletedFolders: number; missing: number }> {
  if (skipDrive) {
    write('Drive cleanup skipped by --skip-drive.');
    return { deletedFiles: 0, deletedFolders: 0, missing: 0 };
  }

  const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawCredentials) {
    write('Drive cleanup skipped: GOOGLE_SERVICE_ACCOUNT_JSON is missing.');
    return { deletedFiles: 0, deletedFolders: 0, missing: 0 };
  }

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(rawCredentials),
    scopes: [DRIVE_SCOPE],
  });
  const drive = google.drive({ version: 'v3', auth });

  let deletedFiles = 0;
  let deletedFolders = 0;
  let missing = 0;

  const deleteDriveId = async (driveId: string, kind: 'file' | 'folder'): Promise<void> => {
    try {
      await drive.files.delete({ fileId: driveId, supportsAllDrives: true });
      if (kind === 'file') deletedFiles += 1;
      else deletedFolders += 1;
    } catch (error) {
      const status = getExternalErrorStatus(error);
      if (status === 404 || status === 410) {
        missing += 1;
        return;
      }
      throw error;
    }
  };

  for (const driveFileId of input.fileIds) {
    await deleteDriveId(driveFileId, 'file');
  }

  const foldersById = new Map(input.folders.map((folder) => [folder.id, folder]));
  const driveFolders = input.folders
    .filter((folder) => folder.driveFolderId)
    .sort((a, b) => folderDepth(b, foldersById) - folderDepth(a, foldersById));

  for (const folder of driveFolders) {
    await deleteDriveId(folder.driveFolderId!, 'folder');
  }

  return { deletedFiles, deletedFolders, missing };
}

async function main(): Promise<void> {
  const companies = await prisma.company.findMany({
    where: { companyName: { startsWith: E2E_COMPANY_PREFIX } },
    select: {
      id: true,
      companyName: true,
      status: true,
      driveRootFolderId: true,
    },
    orderBy: { id: 'asc' },
  });
  const companyIds = companies.map((company) => company.id);
  const bigCompanyIds = toBigIntIds(companyIds);

  const folders = companyIds.length
    ? await prisma.webhardFolder.findMany({
        where: { companyId: { in: companyIds } },
        select: { id: true, parentId: true, driveFolderId: true },
      })
    : [];
  const folderIds = folders.map((folder) => folder.id);
  const files = companyIds.length
    ? await prisma.webhardFile.findMany({
        where: {
          OR: [{ companyId: { in: companyIds } }, { folderId: { in: folderIds } }],
        },
        select: { id: true, driveFileId: true },
      })
    : [];
  const fileIds = files.map((file) => file.id);
  const driveFileIds = files
    .map((file) => file.driveFileId)
    .filter((driveFileId): driveFileId is string => Boolean(driveFileId));

  const [
    shareLinks,
    contacts,
    folderFavorites,
    companyStorage,
    notifications,
    webhardLogs,
    webhardSyncHistory,
    webhardSyncState,
    backupLogs,
    companyFeedback,
    deliveryCompanies,
    activeSessions,
  ] = await Promise.all([
    prisma.shareLink.count({
      where: { OR: [{ companyId: { in: companyIds } }, { webhardFileId: { in: fileIds } }] },
    }),
    prisma.contact.count({ where: { companyId: { in: companyIds } } }),
    prisma.webhardFolderFavorite.count({ where: { folderId: { in: folderIds } } }),
    prisma.companyStorage.count({ where: { companyId: { in: companyIds } } }),
    prisma.notification.count({
      where: {
        OR: [
          { userType: 'company', userId: { in: bigCompanyIds } },
          { title: { contains: E2E_COMPANY_PREFIX } },
          { message: { contains: E2E_COMPANY_PREFIX } },
        ],
      },
    }),
    prisma.webhardLog.count({ where: { companyId: { in: bigCompanyIds } } }),
    prisma.webhardSyncHistory.count({ where: { companyId: { in: companyIds } } }),
    prisma.webhardSyncState.count({ where: { companyId: { in: companyIds } } }),
    prisma.backupLog.count({
      where: { OR: [{ companyId: { in: companyIds } }, { fileId: { in: fileIds } }] },
    }),
    prisma.companyFeedback.count({ where: { companyId: { in: companyIds } } }),
    prisma.deliveryCompany.count({ where: { companyId: { in: bigCompanyIds } } }),
    prisma.activeSession.count({ where: { userType: 'company', userId: { in: companyIds } } }),
  ]);

  write(`Google Drive webhard E2E cleanup`);
  write(`mode: ${apply ? 'apply' : 'dry-run'}`);
  write(`company prefix: ${E2E_COMPANY_PREFIX}`);
  write(`companies: ${companies.length}`);
  for (const company of companies) {
    write(`- ${company.id}: ${company.companyName} (${company.status ?? 'unknown'})`);
  }
  write(`folders: ${folders.length}`);
  write(`files: ${files.length}`);
  write(`drive folders: ${folders.filter((folder) => folder.driveFolderId).length}`);
  write(`drive files: ${driveFileIds.length}`);
  write(`share links: ${shareLinks}`);
  write(`contacts: ${contacts}`);
  write(`folder favorites: ${folderFavorites}`);
  write(`company storage rows: ${companyStorage}`);
  write(`notifications: ${notifications}`);
  write(`webhard logs: ${webhardLogs}`);
  write(`webhard sync history: ${webhardSyncHistory}`);
  write(`webhard sync state: ${webhardSyncState}`);
  write(`backup logs: ${backupLogs}`);
  write(`company feedback: ${companyFeedback}`);
  write(`delivery companies: ${deliveryCompanies}`);
  write(`active sessions: ${activeSessions}`);

  if (!apply) {
    write('No data changed. Re-run with --apply to cleanup.');
    return;
  }

  if (companyIds.length === 0) {
    write('No E2E companies found. Nothing to cleanup.');
    return;
  }

  const driveResult = await deleteDriveItems({ fileIds: driveFileIds, folders });

  await prisma.$transaction([
    prisma.shareLink.deleteMany({
      where: { OR: [{ companyId: { in: companyIds } }, { webhardFileId: { in: fileIds } }] },
    }),
    prisma.webhardFolderFavorite.deleteMany({ where: { folderId: { in: folderIds } } }),
    prisma.backupLog.deleteMany({
      where: { OR: [{ companyId: { in: companyIds } }, { fileId: { in: fileIds } }] },
    }),
    prisma.webhardLog.deleteMany({ where: { companyId: { in: bigCompanyIds } } }),
    prisma.webhardSyncHistory.deleteMany({ where: { companyId: { in: companyIds } } }),
    prisma.webhardSyncState.deleteMany({ where: { companyId: { in: companyIds } } }),
    prisma.companyStorage.deleteMany({ where: { companyId: { in: companyIds } } }),
    prisma.companyFeedback.deleteMany({ where: { companyId: { in: companyIds } } }),
    prisma.deliveryCompany.deleteMany({ where: { companyId: { in: bigCompanyIds } } }),
    prisma.activeSession.deleteMany({ where: { userType: 'company', userId: { in: companyIds } } }),
    prisma.notification.deleteMany({
      where: {
        OR: [
          { userType: 'company', userId: { in: bigCompanyIds } },
          { title: { contains: E2E_COMPANY_PREFIX } },
          { message: { contains: E2E_COMPANY_PREFIX } },
        ],
      },
    }),
    prisma.contact.deleteMany({ where: { companyId: { in: companyIds } } }),
    prisma.webhardFile.deleteMany({ where: { id: { in: fileIds } } }),
    prisma.webhardFolder.deleteMany({ where: { id: { in: folderIds } } }),
    prisma.company.deleteMany({
      where: { id: { in: companyIds }, companyName: { startsWith: E2E_COMPANY_PREFIX } },
    }),
  ]);

  const remainingCompanies = await prisma.company.count({
    where: { companyName: { startsWith: E2E_COMPANY_PREFIX } },
  });

  write('Cleanup complete.');
  write(`Drive deleted files: ${driveResult.deletedFiles}`);
  write(`Drive deleted folders: ${driveResult.deletedFolders}`);
  write(`Drive already missing: ${driveResult.missing}`);
  write(`remaining companies: ${remainingCompanies}`);
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
