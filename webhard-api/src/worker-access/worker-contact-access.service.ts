import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from '../auth/auth.service';

const FIELD_STAGES = new Set(['drawing_confirmed', 'laser', 'cutting', 'creasing', 'delivery']);
const OFFICE_STAGES = new Set(['drawing', 'sample']);
const HIDDEN_WORKER_STATUSES = new Set(['completed', 'deleting']);
const MAX_FOLDER_ANCESTOR_DEPTH = 20;

type WorkerContactAccessRecord = {
  id: string;
  source: string | null;
  inquiryType: string | null;
  processStage: string | null;
  status: string | null;
  deletedAt: Date | null;
};

@Injectable()
export class WorkerContactAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanAccessContact(user: SessionUser, contactId: string): Promise<void> {
    if (user.userType === 'admin') return;
    this.assertWorker(user);

    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        source: true,
        inquiryType: true,
        processStage: true,
        status: true,
        deletedAt: true,
      },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }
    if (!this.isWorkerVisibleContact(contact)) {
      throw new ForbiddenException('Worker contact access denied');
    }
  }

  async assertCanAccessContacts(user: SessionUser, contactIds: string[]): Promise<void> {
    if (user.userType === 'admin') return;
    this.assertWorker(user);

    const uniqueContactIds = [...new Set(contactIds)];
    if (uniqueContactIds.length === 0) return;

    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: uniqueContactIds } },
      select: {
        id: true,
        source: true,
        inquiryType: true,
        processStage: true,
        status: true,
        deletedAt: true,
      },
    });
    const visibleIds = new Set(
      contacts
        .filter((contact) => this.isWorkerVisibleContact(contact))
        .map((contact) => contact.id)
    );

    const hasDeniedContact = uniqueContactIds.some((contactId) => !visibleIds.has(contactId));
    if (hasDeniedContact) {
      throw new ForbiddenException('Worker contact access denied');
    }
  }

  async assertCanAccessFolder(user: SessionUser, folderId: string): Promise<void> {
    if (user.userType === 'admin') return;
    this.assertWorker(user);

    const folder = await this.prisma.webhardFolder.findUnique({
      where: { id: folderId },
      select: { id: true, contactId: true, parentId: true, deletedAt: true },
    });

    if (!folder || folder.deletedAt) {
      throw new NotFoundException('Folder not found');
    }
    const contactId = await this.resolveContactIdForFolder(folder);
    if (!contactId) {
      throw new ForbiddenException('Worker folder access denied');
    }

    await this.assertCanAccessContact(user, contactId);
  }

  async assertCanAccessFile(user: SessionUser, fileId: string): Promise<void> {
    if (user.userType === 'admin') return;
    this.assertWorker(user);

    const file = await this.prisma.webhardFile.findUnique({
      where: { id: fileId },
      select: { id: true, folderId: true, deletedAt: true },
    });

    if (!file || file.deletedAt) {
      throw new NotFoundException('File not found');
    }

    const contactId = await this.resolveContactIdForFile(file.id, file.folderId);
    if (!contactId) {
      throw new ForbiddenException('Worker file access denied');
    }

    await this.assertCanAccessContact(user, contactId);
  }

  private assertWorker(user: SessionUser): void {
    if (user.userType !== 'worker') {
      throw new ForbiddenException('Worker access required');
    }
  }

  private async resolveContactIdForFile(
    fileId: string,
    folderId: string | null
  ): Promise<string | null> {
    if (folderId) {
      return this.resolveContactIdForFolderId(folderId);
    }

    const revision = await this.prisma.drawingRevision.findFirst({
      where: { webhardFileIds: { has: fileId } },
      select: { contactId: true },
    });
    return revision?.contactId ?? null;
  }

  private async resolveContactIdForFolderId(folderId: string): Promise<string | null> {
    const folder = await this.prisma.webhardFolder.findUnique({
      where: { id: folderId },
      select: { id: true, contactId: true, parentId: true, deletedAt: true },
    });

    if (!folder) return null;
    if (folder.deletedAt) {
      throw new ForbiddenException('Worker folder access denied');
    }
    return this.resolveContactIdForFolder(folder);
  }

  private async resolveContactIdForFolder(folder: {
    contactId: string | null;
    parentId: string | null;
  }): Promise<string | null> {
    if (folder.contactId) {
      return folder.contactId;
    }

    let parentId = folder.parentId;
    let depth = 0;
    while (parentId && depth < MAX_FOLDER_ANCESTOR_DEPTH) {
      depth += 1;
      const parent = await this.prisma.webhardFolder.findUnique({
        where: { id: parentId },
        select: { contactId: true, parentId: true, deletedAt: true },
      });
      if (!parent || parent.deletedAt) return null;
      if (parent.contactId) {
        return parent.contactId;
      }
      parentId = parent.parentId;
    }

    return null;
  }

  private isWorkerVisibleContact(contact: WorkerContactAccessRecord): boolean {
    if (contact.deletedAt) return false;
    if (contact.status && HIDDEN_WORKER_STATUSES.has(contact.status)) return false;
    if (contact.status === 'delivered') return true;

    if (contact.source === 'webhard' && contact.inquiryType === null) {
      return true;
    }

    if (FIELD_STAGES.has(contact.processStage ?? '')) {
      return true;
    }

    if (contact.source === 'website' && this.isOfficeStage(contact.processStage)) {
      return true;
    }

    return (
      contact.source === 'webhard' &&
      contact.inquiryType !== null &&
      this.isOfficeStage(contact.processStage)
    );
  }

  private isOfficeStage(processStage: string | null): boolean {
    return processStage === null || OFFICE_STAGES.has(processStage);
  }
}
