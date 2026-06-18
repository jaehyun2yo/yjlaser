/**
 * Development reset for Google Drive webhard storage.
 *
 * Usage:
 *   npx tsx scripts/reset-webhard-for-google-drive.ts
 *   npx tsx scripts/reset-webhard-for-google-drive.ts --apply
 *
 * Preserves company/admin/worker account records. Removes existing webhard,
 * contact, drawing revision, delivery/work, share, backup, and sync runtime data.
 */
import { DriveProvisioningStatus, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const write = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

async function countTargets() {
  const [
    webhardFiles,
    webhardFolders,
    contacts,
    drawingRevisions,
    contactStatusHistory,
    workerNotes,
    deliveries,
    tasks,
    nestingTasks,
    shareLinks,
    backupLogs,
    webhardLogs,
    webhardSyncHistory,
    webhardSyncState,
    companyStorage,
    notifications,
    syncLogs,
  ] = await Promise.all([
    prisma.webhardFile.count(),
    prisma.webhardFolder.count(),
    prisma.contact.count(),
    prisma.drawingRevision.count(),
    prisma.contactStatusHistory.count(),
    prisma.workerNote.count(),
    prisma.delivery.count(),
    prisma.task.count(),
    prisma.nestingTask.count(),
    prisma.shareLink.count(),
    prisma.backupLog.count(),
    prisma.webhardLog.count(),
    prisma.webhardSyncHistory.count(),
    prisma.webhardSyncState.count(),
    prisma.companyStorage.count(),
    prisma.notification.count(),
    prisma.syncLog.count(),
  ]);

  return {
    webhardFiles,
    webhardFolders,
    contacts,
    drawingRevisions,
    contactStatusHistory,
    workerNotes,
    deliveries,
    tasks,
    nestingTasks,
    shareLinks,
    backupLogs,
    webhardLogs,
    webhardSyncHistory,
    webhardSyncState,
    companyStorage,
    notifications,
    syncLogs,
  };
}

async function resetData(): Promise<void> {
  await prisma.$transaction([
    prisma.shareLink.deleteMany(),
    prisma.webhardFolderFavorite.deleteMany(),
    prisma.backupLog.deleteMany(),
    prisma.webhardLog.deleteMany(),
    prisma.webhardSyncHistory.deleteMany(),
    prisma.webhardSyncState.deleteMany(),
    prisma.companyStorage.deleteMany(),
    prisma.workerNote.deleteMany(),
    prisma.contactStatusHistory.deleteMany(),
    prisma.drawingRevision.deleteMany(),
    prisma.delivery.deleteMany(),
    prisma.nestingTask.deleteMany(),
    prisma.task.deleteMany(),
    prisma.notification.deleteMany({
      where: {
        type: {
          in: ['new_contact', 'file_uploaded', 'webhard_classify_failed', 'contact_urgent'],
        },
      },
    }),
    prisma.webhardFile.deleteMany(),
    prisma.webhardFolder.deleteMany(),
    prisma.contact.deleteMany(),
    prisma.syncLog.deleteMany(),
    prisma.company.updateMany({
      data: {
        driveRootFolderId: null,
        driveProvisioningStatus: DriveProvisioningStatus.PENDING,
        driveProvisioningError: null,
        driveProvisioningLastAttemptAt: null,
        driveProvisionedAt: null,
      },
    }),
  ]);
}

async function main(): Promise<void> {
  const before = await countTargets();
  write('Google Drive webhard development reset');
  write(`mode: ${apply ? 'apply' : 'dry-run'}`);
  for (const [name, count] of Object.entries(before)) {
    write(`${name}: ${count}`);
  }

  if (!apply) {
    write('No data changed. Re-run with --apply to reset.');
    return;
  }

  await resetData();
  const after = await countTargets();
  write('Reset complete.');
  for (const [name, count] of Object.entries(after)) {
    write(`${name}: ${count}`);
  }
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
