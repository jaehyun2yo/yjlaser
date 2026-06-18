import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, StorageProvider, WebhardFolder } from '@prisma/client';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { CreateWorkerNoteDto } from './dto/create-worker-note.dto';
import { BatchStartDeliveryDto } from './dto/batch-start-delivery.dto';
import { BatchCompleteDeliveryDto } from './dto/batch-complete-delivery.dto';
import { QueryContactDto, CompanyContactsQueryDto, CountContactDto } from './dto/query-contact.dto';
import { SplitContactDto } from './dto/split-contact.dto';
import { ToggleStageCompletedDto } from './dto/toggle-stage-completed.dto';
import { AdvanceSplitGroupStageDto } from './dto/advance-split-group-stage.dto';
import { isValidStageTransition, PROCESS_STAGE_ORDER } from './constants/process-stages';
import { ContactsGateway } from './contacts.gateway';
import { StorageService } from '../storage/storage.service';
import { NumberService } from '../number/number.service';
import { ContactTimelineService, TimelineActor } from './contact-timeline.service';
import { ContactFolderSyncService } from './contact-folder-sync.service';
import { DrawingRevisionService } from './drawing-revision.service';
import { MailService } from '../mail/mail.service';
import { FoldersService } from '../folders/folders.service';
import { ConfigService } from '@nestjs/config';
import { buildInquiryFileName } from '../common/inquiry-filename.util';
import { extractR2Key } from '../common/r2-key.util';
import { EventsGateway } from '../events/events.gateway';
import { parseStorageReference, toDriveReference } from '../storage/storage-reference.util';

interface ContactWebhardMetadataSource {
  id: string;
  webhardFolderId?: string | null;
}

interface ContactCurrentFileLocation {
  folderId: string;
  folderPath: string | null;
}

interface ContactWebhardMetadata {
  folderPathMap: Map<string, string>;
  webhardFileIdByContact: Map<string, string | null>;
  currentFileLocationByContact: Map<string, ContactCurrentFileLocation>;
}

interface DeliveryProofContact {
  id: string;
  inquiryNumber: string | null;
  workNumber: string | null;
}

interface DeliveryProofFolder {
  id: string;
  companyId: number | null;
  storageProvider: StorageProvider;
  driveFolderId: string | null;
}

interface WebsiteContactFileForWebhard {
  url: string;
  name: string;
  mimeType: string;
  kind: 'drawing' | 'attachment' | 'reference_photo' | 'revision_request';
}

export interface UploadedContactDriveFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ContactDriveUploadFields {
  attachment?: UploadedContactDriveFile[];
  drawing_file?: UploadedContactDriveFile[];
  reference_photos?: UploadedContactDriveFile[];
}

export interface ContactDriveUploadResult {
  uploadedCount: number;
  drawingUploaded: boolean;
  referencePhotoCount: number;
}

export interface RevisionRequestDriveUploadResult {
  url: string;
  name: string;
  size: number;
  mimeType: string;
  driveFileId: string;
  webhardFileId: string | null;
}

export interface ContactDownloadResult {
  url: string;
  fileName: string;
  provider?: StorageProvider;
  fileId?: string;
}

interface WorkerNoteRecord {
  id?: unknown;
  contactId?: unknown;
  contact_id?: unknown;
  type?: unknown;
  content?: unknown;
  createdBy?: unknown;
  created_by?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
}

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    private prisma: PrismaService,
    private contactsGateway: ContactsGateway,
    private storageService: StorageService,
    private numberService: NumberService,
    private timelineService: ContactTimelineService,
    private drawingRevisionService: DrawingRevisionService,
    private mailService: MailService,
    private foldersService: FoldersService,
    private contactFolderSync: ContactFolderSyncService,
    private configService: ConfigService,
    private eventsGateway: EventsGateway
  ) {}

  async uploadContactFilesToDrive(
    contactId: string,
    files: ContactDriveUploadFields
  ): Promise<ContactDriveUploadResult> {
    const startedAt = Date.now();
    const attachment = files.attachment?.find((file) => file.size > 0);
    const drawingFile = files.drawing_file?.find((file) => file.size > 0);
    const referencePhotos = (files.reference_photos ?? []).filter((file) => file.size > 0);
    const requestedCount = Number(Boolean(attachment)) + Number(Boolean(drawingFile)) + referencePhotos.length;

    this.logger.log(
      `Contact Drive upload start: contactId=${contactId}, files=${requestedCount}`
    );

    if (requestedCount === 0) {
      return { uploadedCount: 0, drawingUploaded: false, referencePhotoCount: 0 };
    }

    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, companyName: true },
    });
    if (!contact) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }
    if (!contact.companyName) {
      throw new BadRequestException('업체명이 없는 문의에는 Drive 파일을 저장할 수 없습니다.');
    }

    const inquiryFolder = await this.foldersService.ensureInquiryFolder(contactId);
    if (!inquiryFolder) {
      throw new BadRequestException('문의 폴더를 찾을 수 없습니다.');
    }
    if (
      inquiryFolder.storageProvider !== StorageProvider.GOOGLE_DRIVE ||
      !inquiryFolder.driveFolderId
    ) {
      throw new BadRequestException('Google Drive 문의 폴더가 준비되지 않았습니다.');
    }

    const updateData: Prisma.ContactUpdateInput = {};
    let uploadedCount = 0;
    let drawingReference: { url: string; name: string } | null = null;

    if (attachment) {
      const uploaded = await this.uploadContactDriveBuffer(inquiryFolder, attachment);
      updateData.attachmentUrl = uploaded.reference;
      updateData.attachmentFilename = attachment.originalname;
      uploadedCount += 1;
    }

    if (drawingFile) {
      const uploaded = await this.uploadContactDriveBuffer(inquiryFolder, drawingFile);
      updateData.drawingFileUrl = uploaded.reference;
      updateData.drawingFileName = drawingFile.originalname;
      drawingReference = { url: uploaded.reference, name: drawingFile.originalname };
      uploadedCount += 1;
    }

    if (referencePhotos.length > 0) {
      const references: string[] = [];
      for (const file of referencePhotos) {
        const uploaded = await this.uploadContactDriveBuffer(inquiryFolder, file);
        references.push(uploaded.reference);
        uploadedCount += 1;
      }
      updateData.referencePhotosUrls = JSON.stringify(references);
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.contact.update({
        where: { id: contactId },
        data: { ...updateData, updatedAt: new Date() },
      });
    }

    if (drawingReference) {
      const initialRevision = await this.prisma.drawingRevision.findFirst({
        where: { contactId, source: 'auto_initial' },
        select: { id: true },
      });
      if (!initialRevision) {
        await this.drawingRevisionService.createInitialRevision(
          contactId,
          drawingReference.url,
          drawingReference.name
        );
      }
    }

    await this.syncWebsiteContactFilesToWebhard(contactId);

    this.logger.log(
      `Contact Drive upload success: contactId=${contactId}, files=${uploadedCount}, referencePhotos=${referencePhotos.length}, elapsedMs=${Date.now() - startedAt}`
    );

    return {
      uploadedCount,
      drawingUploaded: Boolean(drawingReference),
      referencePhotoCount: referencePhotos.length,
    };
  }

  async uploadRevisionRequestFileToDrive(
    contactId: string,
    file: UploadedContactDriveFile
  ): Promise<RevisionRequestDriveUploadResult> {
    const startedAt = Date.now();
    this.logger.log(
      `Revision request Drive upload start: contactId=${contactId}, fileSize=${file.size}`
    );

    if (!file || file.size <= 0) {
      throw new BadRequestException('수정요청 첨부 파일이 필요합니다.');
    }

    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        companyName: true,
        inquiryNumber: true,
        workNumber: true,
      },
    });
    if (!contact) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }
    if (!contact.companyName) {
      throw new BadRequestException('업체명이 없는 문의에는 Drive 파일을 저장할 수 없습니다.');
    }

    const inquiryFolder = await this.foldersService.ensureInquiryFolder(contactId);
    if (!inquiryFolder) {
      throw new BadRequestException('문의 폴더를 찾을 수 없습니다.');
    }
    if (
      inquiryFolder.storageProvider !== StorageProvider.GOOGLE_DRIVE ||
      !inquiryFolder.driveFolderId
    ) {
      throw new BadRequestException('Google Drive 문의 폴더가 준비되지 않았습니다.');
    }

    const uploaded = await this.uploadContactDriveBuffer(inquiryFolder, file);
    const webhardFileId = await this.ensureWebsiteContactWebhardFile({
      contact: {
        id: contact.id,
        companyName: contact.companyName,
        inquiryNumber: contact.inquiryNumber,
        workNumber: contact.workNumber,
      },
      inquiryFolder,
      file: {
        url: uploaded.reference,
        name: file.originalname,
        mimeType: file.mimetype || 'application/octet-stream',
        kind: 'revision_request',
      },
    });

    this.logger.log(
      `Revision request Drive upload success: contactId=${contactId}, driveFileId=${uploaded.driveFileId}, elapsedMs=${
        Date.now() - startedAt
      }`
    );

    return {
      url: uploaded.reference,
      name: file.originalname,
      size: file.size,
      mimeType: file.mimetype || 'application/octet-stream',
      driveFileId: uploaded.driveFileId,
      webhardFileId,
    };
  }

  private async uploadContactDriveBuffer(
    inquiryFolder: Pick<WebhardFolder, 'driveFolderId'>,
    file: UploadedContactDriveFile
  ): Promise<{ reference: string; driveFileId: string }> {
    if (!inquiryFolder.driveFolderId) {
      throw new BadRequestException('Google Drive folder id is missing');
    }

    const uploaded = await this.storageService.uploadDriveBuffer({
      fileName: file.originalname,
      mimeType: file.mimetype || 'application/octet-stream',
      buffer: file.buffer,
      parentStorageFolderId: inquiryFolder.driveFolderId,
    });

    return {
      reference: toDriveReference(uploaded.storageFileId),
      driveFileId: uploaded.storageFileId,
    };
  }

  private async syncWebsiteContactFilesToWebhard(contactId: string): Promise<void> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        companyName: true,
        inquiryNumber: true,
        workNumber: true,
        drawingFileUrl: true,
        drawingFileName: true,
        attachmentUrl: true,
        attachmentFilename: true,
        referencePhotosUrls: true,
      },
    });

    if (!contact?.companyName) return;
    const contactContext = {
      id: contact.id,
      companyName: contact.companyName,
      inquiryNumber: contact.inquiryNumber,
      workNumber: contact.workNumber,
    };

    const files = this.collectWebsiteContactFiles({
      drawingFileUrl: contact.drawingFileUrl,
      drawingFileName: contact.drawingFileName,
      attachmentUrl: contact.attachmentUrl,
      attachmentFilename: contact.attachmentFilename,
      referencePhotosUrls: contact.referencePhotosUrls,
    });
    if (files.length === 0) return;

    const inquiryFolder = await this.foldersService.ensureInquiryFolder(contact.id);
    if (!inquiryFolder) {
      this.logger.warn(
        {
          contactId: contact.id,
          companyName: contact.companyName,
          fileCount: files.length,
        },
        'website contact files skipped: inquiry folder unavailable'
      );
      return;
    }

    const drawingFileIds: string[] = [];
    for (const file of files) {
      const fileId = await this.ensureWebsiteContactWebhardFile({
        contact: contactContext,
        inquiryFolder,
        file,
      });
      if (fileId && file.kind === 'drawing') drawingFileIds.push(fileId);
    }

    if (drawingFileIds.length > 0) {
      await this.attachInitialRevisionWebhardFiles(contact.id, drawingFileIds);
    }
  }

  private collectWebsiteContactFiles(input: {
    drawingFileUrl: string | null;
    drawingFileName: string | null;
    attachmentUrl: string | null;
    attachmentFilename: string | null;
    referencePhotosUrls: string | null;
  }): WebsiteContactFileForWebhard[] {
    const files: WebsiteContactFileForWebhard[] = [];

    this.pushWebsiteContactFile(files, input.drawingFileUrl, input.drawingFileName, 'drawing');
    this.pushWebsiteContactFile(files, input.attachmentUrl, input.attachmentFilename, 'attachment');

    const referenceUrls = this.parseReferencePhotoUrls(input.referencePhotosUrls);
    referenceUrls.forEach((url, index) => {
      const fallbackName = `참고사진-${index + 1}${this.getExtensionFromUrl(url)}`;
      this.pushWebsiteContactFile(
        files,
        url,
        this.deriveOriginalNameFromR2Url(url) ?? fallbackName,
        'reference_photo'
      );
    });

    const seenKeys = new Set<string>();
    return files.filter((file) => {
      const reference = parseStorageReference(file.url);
      const key =
        reference.provider === StorageProvider.R2
          ? `${reference.provider}:${extractR2Key(reference.idOrKey)}`
          : `${reference.provider}:${reference.idOrKey}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
  }

  private pushWebsiteContactFile(
    files: WebsiteContactFileForWebhard[],
    url: string | null,
    name: string | null,
    kind: WebsiteContactFileForWebhard['kind']
  ): void {
    if (!url) return;
    const fileName = name?.trim() || this.deriveOriginalNameFromR2Url(url) || 'download';
    files.push({
      url,
      name: fileName,
      mimeType: this.inferMimeType(fileName),
      kind,
    });
  }

  private parseReferencePhotoUrls(referencePhotosUrls: string | null): string[] {
    if (!referencePhotosUrls) return [];
    try {
      const parsed = JSON.parse(referencePhotosUrls) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((url): url is string => typeof url === 'string' && url.trim() !== '');
    } catch {
      return [];
    }
  }

  private deriveOriginalNameFromR2Url(url: string): string | null {
    const key = extractR2Key(url);
    const encodedName = key.split('/').pop();
    if (!encodedName) return null;
    const decodedName = decodeURIComponent(encodedName);
    return (
      decodedName.match(/^\d{13}-[a-z0-9]{8}-\d+-(.+)$/i)?.[1] ??
      decodedName.match(/^\d{13}-[a-z0-9]{8}-(.+)$/i)?.[1] ??
      decodedName
    );
  }

  private getExtensionFromUrl(url: string): string {
    const name = this.deriveOriginalNameFromR2Url(url);
    const extension = name?.match(/\.[A-Za-z0-9]+$/)?.[0];
    return extension ?? '.jpg';
  }

  private inferMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      case 'pdf':
        return 'application/pdf';
      case 'ai':
        return 'application/illustrator';
      case 'dxf':
        return 'application/dxf';
      case 'dwg':
        return 'application/acad';
      default:
        return 'application/octet-stream';
    }
  }

  private async ensureWebsiteContactWebhardFile(params: {
    contact: {
      id: string;
      companyName: string;
      inquiryNumber: string | null;
      workNumber: string | null;
    };
    inquiryFolder: WebhardFolder;
    file: WebsiteContactFileForWebhard;
  }): Promise<string | null> {
    const reference = parseStorageReference(params.file.url);
    const sourceKey =
      reference.provider === StorageProvider.R2 ? extractR2Key(reference.idOrKey) : null;
    const existing = await this.prisma.webhardFile.findFirst({
      where: {
        deletedAt: null,
        ...(reference.provider === StorageProvider.GOOGLE_DRIVE
          ? { driveFileId: reference.idOrKey }
          : { OR: [{ path: sourceKey ?? '' }, { path: params.file.url }] }),
      },
      select: { id: true, folderId: true },
    });

    if (existing) {
      if (existing.folderId !== params.inquiryFolder.id) {
        await this.prisma.webhardFile.update({
          where: { id: existing.id },
          data: {
            folderId: params.inquiryFolder.id,
            companyId: params.inquiryFolder.companyId,
            inquiryNumber: params.contact.inquiryNumber ?? params.contact.workNumber ?? null,
          },
        });
      }
      return existing.id;
    }

    let size = BigInt(0);
    let mimeType = params.file.mimeType;
    let path = sourceKey ?? reference.idOrKey;
    let storageProvider: StorageProvider = StorageProvider.R2;
    let driveFileId: string | null = null;
    let driveMimeType: string | null = null;

    if (reference.provider === StorageProvider.GOOGLE_DRIVE) {
      if (params.inquiryFolder.storageProvider !== StorageProvider.GOOGLE_DRIVE) {
        throw new BadRequestException('Google Drive inquiry folder is required');
      }
      if (!params.inquiryFolder.driveFolderId) {
        throw new BadRequestException('Google Drive folder id is missing');
      }

      const driveMetadata = await this.storageService.confirmDriveUploadedFile({
        storageFileId: reference.idOrKey,
        expectedParentStorageFolderId: params.inquiryFolder.driveFolderId,
      });
      await this.storageService.renameDriveFile({
        storageFileId: reference.idOrKey,
        name: params.file.name,
      });

      size = BigInt(driveMetadata.size ?? 0);
      mimeType = driveMetadata.mimeType ?? mimeType;
      path = `${params.inquiryFolder.id}/${params.file.name}`;
      storageProvider = StorageProvider.GOOGLE_DRIVE;
      driveFileId = reference.idOrKey;
      driveMimeType = driveMetadata.mimeType ?? null;
    } else {
      const driveUpload = await this.copyR2SourceToDriveIfReady({
        key: sourceKey ?? '',
        fileName: params.file.name,
        mimeType,
        folder: params.inquiryFolder,
      });

      if (driveUpload) {
        size = BigInt(driveUpload.size ?? 0);
        mimeType = driveUpload.mimeType ?? mimeType;
        path = `${params.inquiryFolder.id}/${params.file.name}`;
        storageProvider = StorageProvider.GOOGLE_DRIVE;
        driveFileId = driveUpload.storageFileId;
        driveMimeType = driveUpload.mimeType ?? null;
      }
    }

    const created = await this.prisma.webhardFile.create({
      data: {
        name: params.file.name,
        originalName: params.file.name,
        size,
        mimeType,
        path,
        storageProvider,
        driveFileId,
        driveMimeType,
        folderId: params.inquiryFolder.id,
        companyId: params.inquiryFolder.companyId,
        uploadedBy: params.contact.companyName,
        inquiryNumber: params.contact.inquiryNumber ?? params.contact.workNumber ?? null,
      },
      select: { id: true },
    });

    this.eventsGateway.emitToFolder(params.inquiryFolder.id, {
      type: 'file:created',
      folderId: params.inquiryFolder.id,
      data: { fileId: created.id, contactId: params.contact.id },
    });

    return created.id;
  }

  private async copyR2SourceToDriveIfReady(input: {
    key: string;
    fileName: string;
    mimeType: string;
    folder: Pick<WebhardFolder, 'storageProvider' | 'driveFolderId'>;
  }) {
    if (input.folder.storageProvider !== StorageProvider.GOOGLE_DRIVE) {
      return null;
    }
    if (!input.folder.driveFolderId) {
      throw new BadRequestException('Google Drive folder id is missing');
    }

    const buffer = await this.storageService.getFileBuffer(input.key);
    return this.storageService.uploadDriveBuffer({
      fileName: input.fileName,
      mimeType: input.mimeType,
      buffer,
      parentStorageFolderId: input.folder.driveFolderId,
    });
  }

  private async attachInitialRevisionWebhardFiles(
    contactId: string,
    webhardFileIds: string[]
  ): Promise<void> {
    const initialRevision = await this.prisma.drawingRevision.findFirst({
      where: { contactId, source: 'auto_initial' },
      orderBy: { version: 'asc' },
      select: { id: true, webhardFileIds: true },
    });
    if (!initialRevision) return;

    const existingIds = new Set(initialRevision.webhardFileIds ?? []);
    const nextIds = [...initialRevision.webhardFileIds];
    for (const id of webhardFileIds) {
      if (!existingIds.has(id)) nextIds.push(id);
    }

    if (nextIds.length !== initialRevision.webhardFileIds.length) {
      await this.prisma.drawingRevision.update({
        where: { id: initialRevision.id },
        data: { webhardFileIds: nextIds },
      });
    }
  }

  private async resolveContactWebhardMetadata(
    contacts: ContactWebhardMetadataSource[]
  ): Promise<ContactWebhardMetadata> {
    const folderIds = contacts.map((c) => c.webhardFolderId).filter((id): id is string => !!id);

    const folderPathMap: Map<string, string> = new Map();
    if (folderIds.length > 0) {
      const folders = await this.prisma.webhardFolder.findMany({
        where: { id: { in: folderIds } },
        select: { id: true, name: true, path: true, parentId: true },
      });
      const folderMap = new Map(folders.map((f) => [f.id, f]));

      const needsAncestorLookup: string[] = [];
      for (const fId of folderIds) {
        const folder = folderMap.get(fId);
        if (!folder) continue;
        if (folder.path && folder.path !== '/') {
          folderPathMap.set(fId, folder.path);
        } else {
          needsAncestorLookup.push(fId);
        }
      }

      if (needsAncestorLookup.length > 0) {
        let parentIdsToFetch = new Set(
          needsAncestorLookup
            .map((fId) => folderMap.get(fId)?.parentId)
            .filter((id): id is string => !!id && !folderMap.has(id))
        );
        for (let depth = 0; depth < 3 && parentIdsToFetch.size > 0; depth++) {
          const parents = await this.prisma.webhardFolder.findMany({
            where: { id: { in: [...parentIdsToFetch] } },
            select: { id: true, name: true, path: true, parentId: true },
          });
          for (const p of parents) folderMap.set(p.id, p);
          parentIdsToFetch = new Set(
            parents.map((p) => p.parentId).filter((id): id is string => !!id && !folderMap.has(id))
          );
        }

        for (const fId of needsAncestorLookup) {
          const folder = folderMap.get(fId);
          if (!folder) continue;
          if (folder.path && folder.path !== '/') {
            folderPathMap.set(fId, folder.path);
          } else {
            const parts: string[] = [];
            let cur: typeof folder | undefined = folder;
            let depth = 0;
            while (cur && depth < 10) {
              parts.unshift(cur.name);
              cur = cur.parentId ? folderMap.get(cur.parentId) : undefined;
              depth++;
            }
            folderPathMap.set(fId, '/' + parts.join('/'));
          }
        }
      }
    }

    const contactIds = contacts.map((c) => c.id);
    const webhardFileIdByContact = new Map<string, string | null>();
    if (contactIds.length > 0) {
      const latestRevisions = await this.prisma.drawingRevision.findMany({
        where: { contactId: { in: contactIds } },
        orderBy: [{ contactId: 'asc' }, { version: 'desc' }],
        select: { contactId: true, version: true, webhardFileIds: true },
      });
      for (const rev of latestRevisions) {
        if (!webhardFileIdByContact.has(rev.contactId)) {
          webhardFileIdByContact.set(rev.contactId, rev.webhardFileIds?.[0] ?? null);
        }
      }
    }

    const currentFileLocationByContact = new Map<string, ContactCurrentFileLocation>();
    const latestFileIds = [
      ...new Set(
        [...webhardFileIdByContact.values()].filter((id): id is string => typeof id === 'string')
      ),
    ];
    if (latestFileIds.length > 0) {
      const currentFiles = await this.prisma.webhardFile.findMany({
        where: {
          id: { in: latestFileIds },
          deletedAt: null,
        },
        select: {
          id: true,
          folderId: true,
          folder: {
            select: {
              path: true,
            },
          },
        },
      });
      const locationByFileId = new Map(
        currentFiles.map((file) => [
          file.id,
          {
            folderId: file.folderId,
            folderPath: file.folder?.path ?? null,
          },
        ])
      );

      for (const [contactId, fileId] of webhardFileIdByContact) {
        if (!fileId) continue;
        const location = locationByFileId.get(fileId);
        if (!location?.folderId) continue;
        currentFileLocationByContact.set(contactId, {
          folderId: location.folderId,
          folderPath: location.folderPath,
        });
      }
    }

    const contactsWithoutFileLocation = contacts
      .filter((contact) => !currentFileLocationByContact.has(contact.id))
      .map((contact) => contact.id);
    if (contactsWithoutFileLocation.length > 0) {
      const inquiryFolders = await this.prisma.webhardFolder.findMany({
        where: {
          contactId: { in: contactsWithoutFileLocation },
          folderKind: 'inquiry',
          deletedAt: null,
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          contactId: true,
          path: true,
        },
      });

      for (const folder of inquiryFolders) {
        if (!folder.contactId || currentFileLocationByContact.has(folder.contactId)) continue;
        currentFileLocationByContact.set(folder.contactId, {
          folderId: folder.id,
          folderPath: folder.path ?? null,
        });
      }
    }

    return {
      folderPathMap,
      webhardFileIdByContact,
      currentFileLocationByContact,
    };
  }

  private async createAdminContactNotification(input: {
    type: string;
    title: string;
    message: string;
    contactId: string;
    companyName?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userType: 'admin',
          userId: null,
          type: input.type,
          title: input.title,
          message: input.message,
          metadata: {
            contactId: input.contactId,
            companyName: input.companyName ?? null,
            link: `/admin/work-management?contactId=${input.contactId}`,
            ...input.metadata,
          },
        },
      });
    } catch (err) {
      this.logger.warn(
        `contact notification failed: type=${input.type}, contactId=${input.contactId}, error=${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  private applyContactWebhardMetadata(
    result: Record<string, unknown>,
    contact: ContactWebhardMetadataSource,
    metadata: ContactWebhardMetadata
  ) {
    const currentFileLocation = metadata.currentFileLocationByContact.get(contact.id);
    if (currentFileLocation) {
      result['webhard_folder_id'] = currentFileLocation.folderId;
      if (currentFileLocation.folderPath) {
        result['webhard_folder_path'] = currentFileLocation.folderPath;
      }
    } else if (contact.webhardFolderId && metadata.folderPathMap.has(contact.webhardFolderId)) {
      result['webhard_folder_path'] = metadata.folderPathMap.get(contact.webhardFolderId);
    }
    result['webhard_file_id'] = metadata.webhardFileIdByContact.get(contact.id) ?? null;
  }

  /**
   * 문의 목록 조회 (필터, 페이지네이션, 검색, 정렬)
   */
  async findAll(query: QueryContactDto) {
    const {
      status,
      page = 1,
      limit = 20,
      search,
      processStages,
      workCategory,
      inquiryType,
      companyName,
      companyNames,
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeWorkerNotes = false,
      includeTimeline = false,
    } = query;

    const where: Prisma.ContactWhereInput = {
      parentContactId: null, // 하위 문의는 최상위 목록에서 제외
    };

    // Status filter
    if (!status || status === 'all') {
      where.status = { not: 'deleting' };
    } else if (status === 'deleting') {
      where.status = 'deleting';
    } else {
      where.status = status;
    }

    // Process stages filter (specific stage filter takes priority over workCategory)
    if (processStages) {
      const stages = processStages.split(',');
      if (stages.includes('null')) {
        // 'null' = processStage가 없는 문의 (공정 시작 전)
        const nonNull = stages.filter((s) => s !== 'null');
        if (nonNull.length > 0) {
          where.OR = [{ processStage: null }, { processStage: { in: nonNull } }];
        } else {
          where.processStage = null;
        }
      } else {
        where.processStage = { in: stages };
      }
    } else if (workCategory === 'unclassified') {
      // 미분류: 외부웹하드 동기화로 들어온 분류 미확정 Contact 전용
      // (task 23 qa-contact-worker-v1 — 공개 폼 접수 Contact 는 미분류에 포함되지 않음)
      where.source = 'webhard';
      where.inquiryType = null;
      where.status = { notIn: ['delivered', 'completed', 'deleting'] };
    } else if (workCategory === 'office') {
      // 사무실 작업 — 납품/작업완료 제외
      // (a) 공개 폼 접수: inquiryType 무관, processStage 가 null 또는 drawing/sample 일 때 포함
      // (b) 외부웹하드 + 분류 확정: inquiryType 있고 processStage 사무실 단계
      // Prisma 는 `{ in: [null, ...] }` 를 허용하지 않으므로 null 과 in-list 를 분리한다.
      const officeOr: Prisma.ContactWhereInput[] = [
        { source: 'website', processStage: null },
        { source: 'website', processStage: { in: ['drawing', 'sample'] } },
        { source: 'webhard', inquiryType: { not: null }, processStage: null },
        {
          source: 'webhard',
          inquiryType: { not: null },
          processStage: { in: ['drawing', 'sample'] },
        },
      ];
      if (where.OR) {
        // 이미 OR (processStages 필터 등) 가 있으면 AND 로 결합하여 충돌 방지
        const existingOr = where.OR;
        delete where.OR;
        where.AND = [{ OR: existingOr as Prisma.ContactWhereInput[] }, { OR: officeOr }];
      } else {
        where.OR = officeOr;
      }
      where.status = { notIn: ['delivered', 'completed', 'deleting'] };
    } else if (workCategory === 'field') {
      // 현장 작업 — 납품 진행중(delivery+delivered)은 유지, 납품완료/작업완료/삭제는 제외
      where.processStage = {
        in: ['drawing_confirmed', 'laser', 'cutting', 'creasing', 'delivery'],
      };
      where.OR = [
        { status: { notIn: ['delivered', 'completed', 'deleting'] } },
        { processStage: 'delivery', status: 'delivered' },
      ];
    }

    // Inquiry type filter
    if (inquiryType === 'unclassified') {
      where.source = 'webhard';
      where.inquiryType = null;
    } else if (
      inquiryType === 'cutting_request' ||
      inquiryType === 'mold_request' ||
      inquiryType === 'laser_cutting'
    ) {
      where.inquiryType = inquiryType;
    }

    // Company name filter (single — contains match)
    if (companyName && !companyNames) {
      where.companyName = { contains: companyName, mode: 'insensitive' };
    }

    // Company names filter (multi — exact IN match, takes priority over single companyName)
    if (companyNames) {
      const names = companyNames
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
      if (names.length > 0) {
        where.companyName = { in: names };
      }
    }

    // Date range filter (on updatedAt)
    if (dateFrom || dateTo) {
      where.updatedAt = {};
      if (dateFrom) {
        where.updatedAt.gte = new Date(`${dateFrom}T00:00:00.000Z`);
      }
      if (dateTo) {
        // End of day
        where.updatedAt.lte = new Date(`${dateTo}T23:59:59.999Z`);
      }
    }

    // Search filter — use AND to avoid overwriting processStages/workCategory OR
    if (search) {
      const searchConditions = [
        { inquiryNumber: { contains: search, mode: 'insensitive' as const } },
        { workNumber: { contains: search, mode: 'insensitive' as const } },
        { companyName: { contains: search, mode: 'insensitive' as const } },
        { inquiryTitle: { contains: search, mode: 'insensitive' as const } },
        { originalFilename: { contains: search, mode: 'insensitive' as const } },
        { drawingFileName: { contains: search, mode: 'insensitive' as const } },
        { attachmentFilename: { contains: search, mode: 'insensitive' as const } },
        { revisionRequestFileName: { contains: search, mode: 'insensitive' as const } },
      ];

      if (where.OR) {
        // processStages/workCategory already set OR — combine with AND
        const existingOr = where.OR;
        delete where.OR;
        where.AND = [{ OR: existingOr as Prisma.ContactWhereInput[] }, { OR: searchConditions }];
      } else {
        where.OR = searchConditions;
      }
    }

    // Map sortBy to Prisma field — urgent items first
    const orderByField = this.mapSortField(sortBy);
    const orderBy: Prisma.ContactOrderByWithRelationInput[] = [
      { isUrgent: { sort: 'desc', nulls: 'last' } },
      { urgentAt: { sort: 'desc', nulls: 'last' } },
      { [orderByField]: sortOrder },
    ];

    const offset = (page - 1) * limit;

    const [contacts, total] = await this.prisma.executeWithRetry(
      () =>
        Promise.all([
          this.prisma.contact.findMany({
            where,
            orderBy,
            skip: offset,
            take: limit,
            include: {
              ...(includeWorkerNotes
                ? { workerNotes: { orderBy: { createdAt: 'desc' as const } } }
                : {}),
              ...(includeTimeline
                ? { statusHistory: { orderBy: { createdAt: 'asc' as const } } }
                : {}),
              children: {
                where: { deletedAt: null },
                orderBy: { splitIndex: 'asc' as const },
                include: {
                  ...(includeWorkerNotes
                    ? { workerNotes: { orderBy: { createdAt: 'desc' as const } } }
                    : {}),
                  ...(includeTimeline
                    ? { statusHistory: { orderBy: { createdAt: 'asc' as const } } }
                    : {}),
                  drawingRevisions: true,
                },
              },
            },
          }),
          this.prisma.contact.count({ where }),
        ]),
      { operationName: 'contacts.findAll' }
    );

    const webhardMetadata = await this.resolveContactWebhardMetadata(contacts);

    return {
      contacts: contacts.map((c) => {
        const record = c as unknown as Record<string, unknown>;
        const result = this.toSnakeCase(record);
        this.applyContactWebhardMetadata(result, c, webhardMetadata);
        // children 관계를 snake_case로 변환
        if (Array.isArray(record['children'])) {
          result['children'] = (record['children'] as Record<string, unknown>[]).map((child) => {
            const childResult = this.toSnakeCase(child);
            // child 는 include: { drawingRevisions: true } 로 전체 revision 이 포함됨.
            // 그 중 최신(version desc) 의 webhardFileIds[0] 을 webhard_file_id 로 사용.
            const childRevisions = Array.isArray(child['drawingRevisions'])
              ? (child['drawingRevisions'] as Array<{
                  version: number;
                  webhardFileIds?: string[] | null;
                }>)
              : [];
            const latestChildRev = [...childRevisions].sort((a, b) => b.version - a.version)[0];
            childResult['webhard_file_id'] = latestChildRev?.webhardFileIds?.[0] ?? null;
            return childResult;
          });
        }
        return result;
      }),
      totalCount: total,
      hasMore: total > offset + limit,
    };
  }

  /**
   * 고유 업체명 목록 조회 (특정 status 기준)
   */
  async getDistinctCompanyNames(status?: string): Promise<string[]> {
    const where: Prisma.ContactWhereInput = {};
    if (status) {
      where.status = status;
    }

    const results = await this.prisma.contact.findMany({
      where,
      select: { companyName: true },
      distinct: ['companyName'],
      orderBy: { companyName: 'asc' },
    });

    return results.map((r) => r.companyName).filter((name): name is string => Boolean(name));
  }

  /**
   * 상태별 카운트 (RPC get_status_counts 대체)
   * Uses groupBy for a single query instead of 11 separate count queries.
   */
  async getStatusCounts(searchText?: string) {
    const baseWhere: Prisma.ContactWhereInput = {
      parentContactId: null, // 하위 문의는 카운트에서 제외
    };

    if (searchText) {
      baseWhere.OR = [
        { inquiryNumber: { contains: searchText, mode: 'insensitive' } },
        { workNumber: { contains: searchText, mode: 'insensitive' } },
        { companyName: { contains: searchText, mode: 'insensitive' } },
        { inquiryTitle: { contains: searchText, mode: 'insensitive' } },
      ];
    }

    const statuses = [
      'new',
      'received',
      'drawing',
      'confirmed',
      'production',
      'cutting',
      'finishing',
      'delivered',
      'on_hold',
      'revision_in_progress',
      'deleting',
    ] as const;

    const grouped = await this.prisma.executeWithRetry(
      () =>
        this.prisma.contact.groupBy({
          by: ['status'],
          _count: true,
          where: baseWhere,
        }),
      { operationName: 'getStatusCounts' }
    );

    const countMap: Record<string, number> = {};
    for (const row of grouped) {
      if (row.status !== null) {
        countMap[row.status] = row._count;
      }
    }

    const result: Record<string, number> = {};
    for (const s of statuses) {
      result[`${s}_count`] = countMap[s] ?? 0;
    }

    // all_count = total minus deleting
    result.all_count = statuses
      .filter((s) => s !== 'deleting')
      .reduce((sum, s) => sum + (countMap[s] ?? 0), 0);

    return result;
  }

  /**
   * 작업번호(F-번호)로 문의 조회
   */
  async findByWorkNumber(workNumber: string) {
    const contact = await this.prisma.executeWithRetry(
      () =>
        this.prisma.contact.findFirst({
          where: { workNumber, status: { not: 'deleting' } },
          select: {
            id: true,
            workNumber: true,
            inquiryNumber: true,
            processStage: true,
            status: true,
            companyName: true,
            inquiryTitle: true,
            inquiryType: true,
          },
        }),
      { operationName: 'contacts.findByWorkNumber' }
    );

    return contact ?? null;
  }

  /**
   * 단건 조회
   */
  async findOne(id: string) {
    const contact = await this.prisma.executeWithRetry(
      () => this.prisma.contact.findFirst({ where: { id, status: { not: 'deleting' } } }),
      { operationName: 'contacts.findOne' }
    );

    if (!contact) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }

    const latestDrawing = await this.drawingRevisionService.getLatestForCurrentStage(id);

    // task 22: 컨텍스트 메뉴 "웹하드에서 열기" 의 fileId 파라미터 source.
    const latestRevision = await this.prisma.drawingRevision.findFirst({
      where: { contactId: id },
      orderBy: { version: 'desc' },
      select: { webhardFileIds: true },
    });

    return {
      ...this.toSnakeCase(contact),
      latestDrawing: latestDrawing ?? null,
      webhard_file_id: latestRevision?.webhardFileIds?.[0] ?? null,
    };
  }

  /**
   * 문의 생성
   */
  async create(dto: CreateContactDto) {
    // inquiryType 자동 분류: serviceMoldRequest=true → mold_request
    const inquiryType = dto.serviceMoldRequest ? 'mold_request' : (dto.inquiryType ?? null);
    const isMoldRequest = inquiryType === 'mold_request';
    const isCuttingRequest = inquiryType === 'cutting_request';

    // 번호 생성: 미분류(null)→없음, cutting_request→O-번호, mold_request→F-번호
    const inquiryNumber = isCuttingRequest
      ? await this.numberService.generateNumber('inquiry')
      : null;
    const workNumber = isMoldRequest ? await this.numberService.generateNumber('work') : null;

    // 자동 상태/공정단계 매핑
    // - mold_request: 현장 직행 (confirmed + drawing_confirmed)
    // - cutting_request: 사무실 "공정 시작 전" 단계로 시작 (received + null) —
    //   worker 가 [도면작업 시작] 버튼으로 drawing 단계 진입.
    //   hotfix v2 (task 23): 직전 매핑이 'drawing/drawing' 이라 worker 의 "공정 시작 전"
    //   필터에서 누락되고 [도면작업 시작] 버튼이 노출되지 않는 회귀를 수정.
    // - 미분류: 기본값 (received + null)
    const autoStatus = isMoldRequest ? 'confirmed' : null;
    const autoProcessStage = isMoldRequest ? 'drawing_confirmed' : null;

    const data: Prisma.ContactCreateInput = {
      name: dto.name,
      email: dto.email,
      phone: dto.phone ?? '',
      companyName: dto.companyName,
      position: dto.position,
      subject: dto.subject,
      message: dto.message,
      contactType: dto.contactType,
      source: dto.source ?? 'website',
      inquiryType,
      inquiryNumber,
      inquiryTitle: dto.inquiryTitle,
      workNumber,
      status: dto.status ?? autoStatus ?? 'received',
      orderType: dto.orderType,
      memo: dto.memo,
      originalFilename: dto.originalFilename,
      drawingFileUrl: dto.drawingFileUrl,
      drawingFileName: dto.drawingFileName,
      drawingType: dto.drawingType,
      referencePhotosUrls: dto.referencePhotosUrls,
      drawingModification: dto.drawingModification,
      drawingNotes: dto.drawingNotes,
      drawingFileCount: dto.drawingFileCount,
      boxShape: dto.boxShape,
      length: dto.length,
      width: dto.width,
      height: dto.height,
      material: dto.material,
      hasPhysicalSample: dto.hasPhysicalSample,
      hasReferencePhotos: dto.hasReferencePhotos,
      sampleNotes: dto.sampleNotes,
      deliveryMethod: dto.deliveryMethod,
      deliveryAddress: dto.deliveryAddress,
      deliveryName: dto.deliveryName,
      deliveryPhone: dto.deliveryPhone,
      deliveryType: dto.deliveryType,
      deliveryCompanyName: dto.deliveryCompanyName,
      deliveryCompanyPhone: dto.deliveryCompanyPhone,
      deliveryCompanyAddress: dto.deliveryCompanyAddress,
      deliveryNote: dto.deliveryNote,
      receiptMethod: dto.receiptMethod,
      processStage: dto.processStage ?? autoProcessStage,
      workerMemo: dto.workerMemo,
      workerIssue: dto.workerIssue,
      webhardFolderId: dto.webhardFolderId,
      referralSource: dto.referralSource,
      visitLocation: dto.visitLocation,
      visitDate: dto.visitDate,
      visitTimeSlot: dto.visitTimeSlot,
      serviceMoldRequest: dto.serviceMoldRequest,
      serviceDeliveryBrokerage: dto.serviceDeliveryBrokerage,
      attachmentFilename: dto.attachmentFilename,
      attachmentUrl: dto.attachmentUrl,
      portfolioReferenceId: dto.portfolioReferenceId,
      portfolioReferenceTitle: dto.portfolioReferenceTitle,
      portfolioReferenceUrl: dto.portfolioReferenceUrl,
      portfolioReferenceInfo: dto.portfolioReferenceInfo
        ? JSON.parse(dto.portfolioReferenceInfo)
        : undefined,
    };

    // 목형의뢰: 현장 직행이므로 productionStartedAt 설정
    if (isMoldRequest) {
      (data as Record<string, unknown>).productionStartedAt = new Date();
    }

    // Remove undefined values
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    ) as Prisma.ContactCreateInput;

    // Contact INSERT + timeline(created) + initial drawing revision 을 단일 트랜잭션으로 원자화.
    // 하나라도 실패하면 전체 롤백 — Contact 만 남고 타임라인/초기 도면이 비는 상태를 원천 차단.
    const contact = await this.prisma.$transaction(async (tx) => {
      const created = await tx.contact.create({ data: cleanData });

      await this.timelineService.recordChange({
        contactId: created.id,
        changeType: 'created',
        toStatus: (cleanData.status as string) || 'received',
        toStage: (cleanData.processStage as string) || null,
        actorType: 'admin',
        source: 'manual',
        companyName: created.companyName || undefined,
        tx,
      });

      if (created.drawingFileUrl) {
        await this.drawingRevisionService.createInitialRevision(
          created.id,
          created.drawingFileUrl,
          created.drawingFileName,
          { tx }
        );
      }

      // 웹하드 폴더 자동 연결 — task 23: ContactFolderSyncService 단일 진입점으로 위임.
      // - Company 매칭 성공 + inquiryType 확정: strict 정책 (task 20 Phase 2) — 실패 시 트랜잭션 롤백.
      // - Company 미매칭 + inquiryType 확정 (task 21 Phase 2): mismatch 알림 + best-effort
      //   onContactCreated. 내부에서 fallback 폴더 탐색이 동작.
      if (created.companyName) {
        const company = await tx.company.findFirst({
          where: { companyName: created.companyName },
          select: { id: true },
        });
        if (!company) {
          await tx.notification
            .create({
              data: {
                userType: 'admin',
                userId: null,
                type: 'webhard_company_mismatch',
                title: '웹하드 업체 폴더 매칭 실패',
                message: `Contact ${created.id} 의 companyName '${created.companyName}' 에 매칭되는 Company 레코드가 없음.`,
                metadata: {
                  contactId: created.id,
                  companyName: created.companyName,
                },
              },
            })
            .catch((err) => {
              this.logger.warn(
                `Failed to create webhard_company_mismatch notification (contactId=${created.id}): ${
                  err instanceof Error ? err.message : err
                }`
              );
            });
          this.logger.warn(
            `webhard_company_mismatch: contactId=${created.id}, companyName=${created.companyName}`
          );
          if (created.inquiryType) {
            try {
              await this.contactFolderSync.onContactCreated({ contactId: created.id, client: tx });
            } catch (err) {
              this.logger.warn(
                `onContactCreated best-effort failed (contactId=${created.id}, companyName=${created.companyName}): ${
                  err instanceof Error ? err.message : err
                }`
              );
            }
          }
        } else if (created.inquiryType) {
          // strict: 위임 내부 throw 시 tx rollback 으로 Contact 생성도 취소.
          await this.contactFolderSync.onContactCreated({ contactId: created.id, client: tx });
        }
      }

      return created;
    });

    const result = this.toSnakeCase(contact);
    this.contactsGateway.emitContactCreated(result);

    await this.syncWebsiteContactFilesToWebhard(contact.id).catch((err) => {
      this.logger.warn(
        `Website contact file webhard sync failed (contactId=${contact.id}): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    });

    await this.createAdminContactNotification({
      type: 'new_contact',
      title: '새 문의 접수',
      message: `${contact.companyName || contact.name || '업체 미확인'} 문의가 접수되었습니다.`,
      contactId: contact.id,
      companyName: contact.companyName,
      metadata: {
        inquiryNumber: contact.inquiryNumber,
        workNumber: contact.workNumber,
        source: contact.source,
      },
    });

    // Email notification: fire-and-forget (non-blocking)
    this.mailService
      .sendContactNotification({
        contactId: String(contact.id),
        companyName: contact.companyName || '',
        name: contact.name,
        email: contact.email,
        phone: contact.phone || undefined,
        position: contact.position || undefined,
        inquiryTitle: contact.inquiryTitle || undefined,
        drawingType: contact.drawingType || undefined,
        drawingFileUrl: contact.drawingFileUrl || undefined,
        drawingFileName: contact.drawingFileName || undefined,
        drawingModification: contact.drawingModification || undefined,
        drawingNotes: contact.drawingNotes || undefined,
        referencePhotosUrls: contact.referencePhotosUrls || undefined,
        attachmentFilename: contact.attachmentFilename || undefined,
        attachmentUrl: contact.attachmentUrl || undefined,
        boxShape: contact.boxShape || undefined,
        length: contact.length || undefined,
        width: contact.width || undefined,
        height: contact.height || undefined,
        material: contact.material || undefined,
        hasPhysicalSample: contact.hasPhysicalSample ?? undefined,
        hasReferencePhotos: contact.hasReferencePhotos ?? undefined,
        sampleNotes: contact.sampleNotes || undefined,
        receiptMethod: contact.receiptMethod || undefined,
        visitDate: contact.visitDate || undefined,
        visitTimeSlot: contact.visitTimeSlot || undefined,
        deliveryType: contact.deliveryType || undefined,
        deliveryAddress: contact.deliveryAddress || undefined,
        deliveryName: contact.deliveryName || undefined,
        deliveryPhone: contact.deliveryPhone || undefined,
        deliveryMethod: contact.deliveryMethod || undefined,
        deliveryCompanyName: contact.deliveryCompanyName || undefined,
        deliveryCompanyPhone: contact.deliveryCompanyPhone || undefined,
        deliveryCompanyAddress: contact.deliveryCompanyAddress || undefined,
        referralSource: contact.referralSource || undefined,
      })
      .catch((err) => {
        this.logger.error(`Contact notification email failed: ${err.message}`);
      });

    return result;
  }

  /**
   * 배치 생성
   */
  async createBatch(contacts: Prisma.ContactCreateManyInput[]) {
    const result = await this.prisma.contact.createMany({ data: contacts });
    return { count: result.count };
  }

  /**
   * 문의 수정
   */
  async update(id: string, dto: UpdateContactDto) {
    // Verify exists (select only id for existence check)
    const existing = await this.prisma.contact.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }

    const data: Prisma.ContactUpdateInput = {
      updatedAt: new Date(),
    };

    // Map DTO fields to Prisma fields
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.companyName !== undefined) data.companyName = dto.companyName;
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.processStage !== undefined) data.processStage = dto.processStage;
    if (dto.workNumber !== undefined) data.workNumber = dto.workNumber;
    if (dto.inquiryType !== undefined) data.inquiryType = dto.inquiryType;
    if (dto.memo !== undefined) data.memo = dto.memo;
    if (dto.drawingFileUrl !== undefined) data.drawingFileUrl = dto.drawingFileUrl;
    if (dto.drawingFileName !== undefined) data.drawingFileName = dto.drawingFileName;
    if (dto.drawingType !== undefined) data.drawingType = dto.drawingType;
    if (dto.drawingModification !== undefined) data.drawingModification = dto.drawingModification;
    if (dto.drawingNotes !== undefined) data.drawingNotes = dto.drawingNotes;
    if (dto.sampleNotes !== undefined) data.sampleNotes = dto.sampleNotes;
    if (dto.boxShape !== undefined) data.boxShape = dto.boxShape;
    if (dto.length !== undefined) data.length = dto.length;
    if (dto.width !== undefined) data.width = dto.width;
    if (dto.height !== undefined) data.height = dto.height;
    if (dto.material !== undefined) data.material = dto.material;
    if (dto.hasPhysicalSample !== undefined) data.hasPhysicalSample = dto.hasPhysicalSample;
    if (dto.hasReferencePhotos !== undefined) data.hasReferencePhotos = dto.hasReferencePhotos;
    if (dto.deliveryMethod !== undefined) data.deliveryMethod = dto.deliveryMethod;
    if (dto.deliveryAddress !== undefined) data.deliveryAddress = dto.deliveryAddress;
    if (dto.deliveryName !== undefined) data.deliveryName = dto.deliveryName;
    if (dto.deliveryPhone !== undefined) data.deliveryPhone = dto.deliveryPhone;
    if (dto.deliveryType !== undefined) data.deliveryType = dto.deliveryType;
    if (dto.deliveryCompanyName !== undefined) data.deliveryCompanyName = dto.deliveryCompanyName;
    if (dto.deliveryCompanyPhone !== undefined)
      data.deliveryCompanyPhone = dto.deliveryCompanyPhone;
    if (dto.deliveryCompanyAddress !== undefined)
      data.deliveryCompanyAddress = dto.deliveryCompanyAddress;
    if (dto.receiptMethod !== undefined) data.receiptMethod = dto.receiptMethod;
    if (dto.visitDate !== undefined) data.visitDate = dto.visitDate;
    if (dto.visitTimeSlot !== undefined) data.visitTimeSlot = dto.visitTimeSlot;
    if (dto.revisionRequestTitle !== undefined)
      data.revisionRequestTitle = dto.revisionRequestTitle;
    if (dto.revisionRequestContent !== undefined)
      data.revisionRequestContent = dto.revisionRequestContent;
    if (dto.revisionRequestFileUrl !== undefined)
      data.revisionRequestFileUrl = dto.revisionRequestFileUrl;
    if (dto.revisionRequestFileName !== undefined)
      data.revisionRequestFileName = dto.revisionRequestFileName;
    if (dto.workerMemo !== undefined) data.workerMemo = dto.workerMemo;
    if (dto.workerIssue !== undefined) data.workerIssue = dto.workerIssue;
    if (dto.workerMemoBy !== undefined) {
      data.workerMemoBy = dto.workerMemoBy;
      data.workerMemoAt = new Date();
    }
    if (dto.webhardFolderId !== undefined) data.webhardFolderId = dto.webhardFolderId;
    if (dto.isUrgent !== undefined) {
      data.isUrgent = dto.isUrgent;
      data.urgentAt = dto.isUrgent ? new Date() : null;
    }
    if (dto.attachmentFilename !== undefined) data.attachmentFilename = dto.attachmentFilename;
    if (dto.attachmentUrl !== undefined) data.attachmentUrl = dto.attachmentUrl;
    if (dto.originalFilename !== undefined) data.originalFilename = dto.originalFilename;
    if (dto.referencePhotosUrls !== undefined) data.referencePhotosUrls = dto.referencePhotosUrls;
    if (dto.drawingFileCount !== undefined) data.drawingFileCount = dto.drawingFileCount;
    if (dto.isRead !== undefined) data.isRead = dto.isRead;
    if (dto.serviceMoldRequest !== undefined) data.serviceMoldRequest = dto.serviceMoldRequest;
    if (dto.serviceDeliveryBrokerage !== undefined)
      data.serviceDeliveryBrokerage = dto.serviceDeliveryBrokerage;

    const updated = await this.prisma.contact.update({ where: { id }, data });
    const result = this.toSnakeCase(updated);
    this.contactsGateway.emitContactUpdated(result);
    return result;
  }

  /**
   * 상태 변경
   */
  async updateStatus(id: string, status: string, actor?: TimelineActor) {
    const existing = await this.prisma.executeWithRetry(
      () =>
        this.prisma.contact.findUnique({
          where: { id },
          select: { id: true, status: true, workNumber: true, companyName: true },
        }),
      { operationName: 'contacts.updateStatus.findExisting' }
    );
    if (!existing) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }

    // 멱등성: 동일 상태로 변경 요청 시 업데이트 없이 반환
    if (existing.status === status) {
      const contact = await this.prisma.executeWithRetry(
        () => this.prisma.contact.findUnique({ where: { id } }),
        { operationName: 'contacts.updateStatus.findIdempotent' }
      );
      if (!contact) throw new NotFoundException('문의를 찾을 수 없습니다.');
      return this.toSnakeCase(contact);
    }

    const data: Prisma.ContactUpdateInput = { status, updatedAt: new Date() };

    // production 전환 시 work_number 자동 부여 (멱등성: null인 경우만)
    const issueWorkNumber = status === 'production' && !existing.workNumber;
    if (issueWorkNumber) {
      data.workNumber = await this.numberService.generateNumber('work');
      data.productionStartedAt = new Date();
    }

    const updated = issueWorkNumber
      ? await this.prisma.$transaction(async (tx) => {
          const upd = await tx.contact.update({ where: { id }, data });
          // workNumber 갱신 — 기존 `{O}` 폴더가 있으면 `{O}_{F}` 로 rename.
          await this.foldersService.renameInquiryFolderForContact(id, tx);
          const folder = await this.foldersService.ensureInquiryFolder(id, tx);
          if (folder) {
            await this.foldersService.relocateContactFiles(id, folder.id, tx);
          }
          return upd;
        })
      : await this.prisma.executeWithRetry(
          () => this.prisma.contact.update({ where: { id }, data }),
          { operationName: 'contacts.updateStatus.update' }
        );

    const result = this.toSnakeCase(updated);
    this.contactsGateway.emitContactStatusChanged(result);

    // Timeline: fire-and-forget (non-blocking)
    await this.timelineService
      .recordChange({
        contactId: id,
        changeType: 'status_change',
        fromStatus: existing.status,
        toStatus: status,
        actorType: actor?.actorType || 'admin',
        actorName: actor?.actorName,
        companyName: actor?.companyName || existing.companyName || undefined,
        companyId: actor?.companyId,
        source: 'manual',
      })
      .catch((err) => {
        this.logger.error(`Timeline record failed: ${err.message}`);
      });

    return result;
  }

  /**
   * 공정 단계 변경
   */
  async updateProcessStage(id: string, processStage: string | null, actor?: TimelineActor) {
    // 하위호환: inspection은 삭제된 단계 → delivery로 정규화
    if (processStage === 'inspection') processStage = 'delivery';

    const existing = await this.prisma.executeWithRetry(
      () =>
        this.prisma.contact.findUnique({
          where: { id },
          select: {
            id: true,
            processStage: true,
            status: true,
            companyName: true,
            workNumber: true,
            inquiryNumber: true,
            inquiryTitle: true,
            inquiryType: true,
          },
        }),
      { operationName: 'contacts.updateProcessStage.findExisting' }
    );

    if (!existing) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }

    // 멱등성: 동일 공정 단계로 변경 요청 시 업데이트 없이 반환
    if (existing.processStage === processStage) {
      return {
        id: existing.id,
        process_stage: existing.processStage,
        previous_stage: existing.processStage,
        previous_status: existing.status,
        work_number: existing.workNumber,
        status: existing.status,
        inquiry_type: existing.inquiryType,
        updated_at: new Date(),
        status_changed: false,
      };
    }

    // 레이저 전용 문의: laser 단계에서 cutting/creasing/delivery로 이동 시 바로 완료 처리
    const LASER_SKIP_STAGES = ['cutting', 'creasing', 'delivery'];
    if (
      existing.inquiryType === 'laser_cutting' &&
      existing.processStage === 'laser' &&
      processStage !== null &&
      LASER_SKIP_STAGES.includes(processStage)
    ) {
      const laserCompleted = await this.prisma.executeWithRetry(
        () =>
          this.prisma.contact.update({
            where: { id },
            data: {
              status: 'completed',
              processStage: null,
              updatedAt: new Date(),
            },
            select: {
              id: true,
              processStage: true,
              status: true,
              workNumber: true,
              inquiryType: true,
              updatedAt: true,
            },
          }),
        { operationName: 'contacts.updateProcessStage.completeLaserOnly' }
      );

      const laserResult = {
        id: laserCompleted.id,
        process_stage: laserCompleted.processStage,
        previous_stage: existing.processStage,
        previous_status: existing.status,
        work_number: laserCompleted.workNumber,
        status: laserCompleted.status,
        inquiry_type: laserCompleted.inquiryType,
        updated_at: laserCompleted.updatedAt,
        status_changed: true,
      };
      this.contactsGateway.emitContactProcessStageChanged(laserResult);
      this.contactsGateway.emitContactStatusChanged(laserResult);

      await this.timelineService
        .recordChange({
          contactId: id,
          changeType: 'completed',
          fromStage: existing.processStage,
          toStage: null,
          fromStatus: existing.status,
          toStatus: 'completed',
          actorType: actor?.actorType || 'admin',
          actorName: actor?.actorName,
          companyName: actor?.companyName || existing.companyName || undefined,
          source: 'manual',
          note: '레이저가공 완료 (레이저 전용 업체)',
        })
        .catch((err) => {
          this.logger.error(`Timeline record failed: ${err.message}`);
        });

      return laserResult;
    }

    // 사무실→현장 전환 시 work_number(F-번호) 자동 부여 (멱등성: null인 경우만)
    const OFFICE_STAGES: Array<string | null> = [null, 'drawing', 'sample'];
    const FIELD_STAGES = ['drawing_confirmed', 'laser', 'cutting', 'creasing', 'delivery'];
    const isOfficeToField =
      OFFICE_STAGES.includes(existing.processStage) && FIELD_STAGES.includes(processStage ?? '');

    const data: Prisma.ContactUpdateInput = { processStage, updatedAt: new Date() };

    const issueWorkNumber = isOfficeToField && !existing.workNumber;
    if (issueWorkNumber) {
      const newWorkNumber = await this.numberService.generateNumber('work');
      data.workNumber = newWorkNumber;

      // inquiry_title의 O-번호 접두사를 F-번호로 교체
      if (existing.inquiryTitle && existing.inquiryNumber) {
        data.inquiryTitle = existing.inquiryTitle.replace(existing.inquiryNumber, newWorkNumber);
      }
    }

    // Auto status transition: reduce frontend round-trips from 3 to 1
    let autoStatusChange: string | null = null;
    if (processStage !== null && processStage !== 'delivery') {
      if (existing.status === 'delivered') {
        autoStatusChange = 'drawing';
      } else if (existing.status === 'received' || existing.status === 'on_hold') {
        autoStatusChange = 'drawing';
      }
    }

    if (autoStatusChange) {
      data.status = autoStatusChange;
    }

    // task 23 phase 5 — 사무실→현장 전환 시 폴더 rename/ensure/relocate 는
    // workNumber 신규 발급 여부와 무관하게 실행한다.
    //   * 기존 버그: workNumber 이미 존재 시 rename 을 skip 했음 (drawing_confirmed 되돌림·재전환 케이스 silent fail)
    //   * 수정 후:  isOfficeToField 전환이면 항상 $transaction 내에서 onProcessStageChanged 훅 호출
    //              → `{O}` → `{O}_{F}` rename + ensure + relocate 보장
    //              → drawing_confirmed 전환 시 폴더 확보 실패하면 UnprocessableEntityException 으로 롤백
    const updated = isOfficeToField
      ? await this.prisma.$transaction(async (tx) => {
          const upd = await tx.contact.update({
            where: { id },
            data,
            select: {
              id: true,
              processStage: true,
              status: true,
              workNumber: true,
              inquiryType: true,
              updatedAt: true,
            },
          });
          await this.contactFolderSync.onProcessStageChanged({
            contactId: id,
            client: tx,
            previousStage: existing.processStage,
            nextStage: processStage as string,
          });
          return upd;
        })
      : await this.prisma.executeWithRetry(
          () =>
            this.prisma.contact.update({
              where: { id },
              data,
              select: {
                id: true,
                processStage: true,
                status: true,
                workNumber: true,
                inquiryType: true,
                updatedAt: true,
              },
            }),
          { operationName: 'contacts.updateProcessStage.update' }
        );

    // 납품 단계 진입 시 문의 폴더를 `완료/` 로 이동. Best Effort — 실패해도 stage 전환은 성공으로.
    if (processStage === 'delivery' && existing.processStage !== 'delivery') {
      try {
        await this.foldersService.moveInquiryFolderToCompleted(id);
      } catch (err) {
        this.logger.warn(
          `moveInquiryFolderToCompleted failed for contactId=${id}: ${err instanceof Error ? err.message : err}`
        );
      }
    }

    const processStageResult = {
      id: updated.id,
      process_stage: updated.processStage,
      previous_stage: existing.processStage,
      previous_status: existing.status,
      work_number: updated.workNumber,
      status: updated.status,
      inquiry_type: updated.inquiryType,
      updated_at: updated.updatedAt,
      status_changed: autoStatusChange !== null,
    };
    this.contactsGateway.emitContactProcessStageChanged(processStageResult);

    // Emit status change event if status was auto-updated
    if (autoStatusChange) {
      this.contactsGateway.emitContactStatusChanged(processStageResult);
    }

    // Timeline: fire-and-forget (non-blocking)
    await this.timelineService
      .recordChange({
        contactId: id,
        changeType: 'process_stage_change',
        fromStage: existing.processStage,
        toStage: processStage,
        actorType: actor?.actorType || 'admin',
        actorName: actor?.actorName,
        companyName: actor?.companyName || existing.companyName || undefined,
        source: 'manual',
      })
      .catch((err) => {
        this.logger.error(`Timeline record failed: ${err.message}`);
      });

    // Timeline for auto status change: fire-and-forget
    if (autoStatusChange) {
      await this.timelineService
        .recordChange({
          contactId: id,
          changeType: 'status_change',
          fromStatus: existing.status,
          toStatus: autoStatusChange,
          actorType: actor?.actorType || 'admin',
          actorName: actor?.actorName,
          companyName: actor?.companyName || existing.companyName || undefined,
          source: 'system',
        })
        .catch((err) => {
          this.logger.error(`Timeline record failed: ${err.message}`);
        });
    }

    return processStageResult;
  }

  /**
   * 레이저 전용 문의를 즉시 완료 처리
   * laser_cutting 문의가 레이저가공 완료 시 칼작업/오시작업 스킵하고 바로 completed
   */
  async completeLaserOnlyContact(id: string, actor?: TimelineActor, options?: { note?: string }) {
    const existing = await this.prisma.executeWithRetry(
      () =>
        this.prisma.contact.findUnique({
          where: { id },
          select: {
            id: true,
            inquiryType: true,
            processStage: true,
            status: true,
            companyName: true,
          },
        }),
      { operationName: 'contacts.completeLaserOnly.findExisting' }
    );

    if (!existing) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }

    if (existing.inquiryType !== 'laser_cutting') {
      throw new BadRequestException(
        '레이저 전용 문의(inquiry_type=laser_cutting)만 완료 처리할 수 있습니다.'
      );
    }

    const updated = await this.prisma.executeWithRetry(
      () =>
        this.prisma.contact.update({
          where: { id },
          data: {
            status: 'completed',
            processStage: null,
            updatedAt: new Date(),
          },
        }),
      { operationName: 'contacts.completeLaserOnly.update' }
    );

    const result = this.toSnakeCase(updated as unknown as Record<string, unknown>);
    this.contactsGateway.emitContactStatusChanged(result);

    await this.timelineService
      .recordChange({
        contactId: id,
        changeType: 'completed',
        fromStage: existing.processStage,
        toStage: null,
        fromStatus: existing.status,
        toStatus: 'completed',
        actorType: actor?.actorType || 'admin',
        actorName: actor?.actorName,
        companyName: actor?.companyName || existing.companyName || undefined,
        source: 'manual',
        note: options?.note?.trim() || '레이저가공 완료 (레이저 전용 업체)',
      })
      .catch((err) => {
        this.logger.error(`Timeline record failed: ${err.message}`);
      });

    // task 29 Phase 3: 일반 delivery 와 동일하게 inquiry 폴더를 완료/ 로 이동.
    // Best Effort — 폴더 이동 실패해도 status 전환은 성공 (작업자 UX 회귀 방지).
    // 일반 delivery 분기 (updateProcessStage) 와 동일한 로그 레벨(warn) 유지 — 운영 alert 룰 일관성.
    try {
      await this.foldersService.moveInquiryFolderToCompleted(id);
    } catch (err) {
      this.logger.warn(
        `moveInquiryFolderToCompleted failed for contactId=${id}: ${
          err instanceof Error ? err.message : err
        }`
      );
    }

    return result;
  }

  /**
   * inquiry_type 변경 (+ 자동 상태/공정단계 매핑)
   */
  async updateInquiryType(id: string, inquiryType: string, actor?: TimelineActor) {
    const existing = await this.prisma.contact.findUnique({
      where: { id },
      select: {
        id: true,
        source: true,
        inquiryType: true,
        inquiryNumber: true,
        workNumber: true,
        inquiryTitle: true,
        processStage: true,
        status: true,
        companyName: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }

    const statusMap: Record<string, { status: string; processStage: string }> = {
      cutting_request: { status: 'drawing', processStage: 'drawing' },
      mold_request: { status: 'confirmed', processStage: 'drawing_confirmed' },
      laser_cutting: { status: 'cutting', processStage: 'laser' },
    };

    const mapping = statusMap[inquiryType];
    if (!mapping) {
      throw new BadRequestException('유효하지 않은 inquiry_type 값입니다.');
    }

    // 분류 시 작업번호 자동 부여 (멱등성: 기존 번호 없는 경우만)
    const isFieldType = inquiryType === 'mold_request' || inquiryType === 'laser_cutting';
    const isOfficeType = inquiryType === 'cutting_request';

    const data: Prisma.ContactUpdateInput = {
      inquiryType,
      status: mapping.status,
      processStage: mapping.processStage,
      updatedAt: new Date(),
    };

    const issueInquiryNumber = isOfficeType && !existing.inquiryNumber;
    if (issueInquiryNumber) {
      const newNumber = await this.numberService.generateNumber('inquiry');
      data.inquiryNumber = newNumber;
      // inquiryTitle에 번호 접두사 추가
      if (existing.inquiryTitle) {
        data.inquiryTitle = `${newNumber} ${existing.inquiryTitle}`;
      }
    }

    const issueWorkNumber = isFieldType && !existing.workNumber;
    if (issueWorkNumber) {
      const newNumber = await this.numberService.generateNumber('work');
      data.workNumber = newNumber;
      // inquiryTitle에 번호 접두사 추가 (기존 O-번호가 있으면 교체, 없으면 앞에 추가)
      if (existing.inquiryTitle && existing.inquiryNumber) {
        data.inquiryTitle = existing.inquiryTitle.replace(existing.inquiryNumber, newNumber);
      } else if (existing.inquiryTitle) {
        data.inquiryTitle = `${newNumber} ${existing.inquiryTitle}`;
      }
    }

    // inquiryType 분류 확정 — 폴더 rename → ensure → relocate 3 단계를
    // ContactFolderSyncService.onInquiryTypeClassified 로 위임 (task 23 단일 진입점).
    const updated = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.contact.update({ where: { id }, data });
      await this.contactFolderSync.onInquiryTypeClassified({ contactId: id, client: tx });
      return upd;
    });

    const inquiryResult = this.toSnakeCase(updated);
    this.contactsGateway.emitContactUpdated(inquiryResult);

    // Timeline: fire-and-forget (non-blocking)
    await this.timelineService
      .recordChange({
        contactId: id,
        changeType: 'inquiry_type_change',
        fromStatus: existing.status,
        toStatus: mapping.status,
        fromStage: existing.processStage,
        toStage: mapping.processStage,
        actorType: actor?.actorType || 'admin',
        actorName: actor?.actorName,
        companyName: actor?.companyName || existing.companyName || undefined,
        source: 'manual',
        metadata: { inquiryType },
      })
      .catch((err) => {
        this.logger.error(`Timeline record failed: ${err.message}`);
      });

    return inquiryResult;
  }

  /**
   * 뱃지 확인 (booking_changed_at / delivery_method_changed_at null 처리)
   */
  async acknowledgeBadge(id: string, field: 'booking_changed_at' | 'delivery_method_changed_at') {
    const prismaField =
      field === 'booking_changed_at' ? 'bookingChangedAt' : 'deliveryMethodChangedAt';

    await this.prisma.contact.update({
      where: { id },
      data: { [prismaField]: null },
    });

    return { success: true };
  }

  /**
   * 소프트 삭제 (status → 'deleting', deleted_at 설정)
   */
  async softDelete(id: string) {
    const existing = await this.prisma.contact.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }

    // 이미 삭제 상태면 멱등하게 성공 반환
    if (existing.status === 'deleting') {
      return { success: true };
    }

    try {
      await this.prisma.contact.update({
        where: { id, status: { not: 'deleting' } },
        data: {
          status: 'deleting',
          deletedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      // Race condition: 동시 요청으로 이미 상태 변경된 경우
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        this.logger.warn(`Contact ${id} already deleted (race condition)`);
        return { success: true };
      }
      throw error;
    }

    this.contactsGateway.emitContactDeleted(id);

    // Timeline: fire-and-forget (non-blocking)
    await this.timelineService
      .recordChange({
        contactId: id,
        changeType: 'deleted',
        fromStatus: existing.status,
        toStatus: 'deleting',
        actorType: 'admin',
        source: 'manual',
      })
      .catch((err) => {
        this.logger.error(`Timeline record failed: ${err.message}`);
      });

    return { success: true };
  }

  /**
   * 영구 삭제
   */
  async permanentDelete(id: string) {
    try {
      await this.prisma.contact.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('문의를 찾을 수 없습니다.');
      }
      throw error;
    }
    this.contactsGateway.emitContactDeleted(id);
    return { success: true };
  }

  /**
   * 복원 (status → 'received', deleted_at → null)
   */
  async restore(id: string) {
    const existing = await this.prisma.contact.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }

    if (existing.status !== 'deleting') {
      throw new BadRequestException('삭제중 상태인 문의만 복원할 수 있습니다.');
    }

    await this.prisma.contact.update({
      where: { id, status: 'deleting' },
      data: {
        status: 'received',
        deletedAt: null,
        updatedAt: new Date(),
      },
    });

    // Timeline: fire-and-forget (non-blocking)
    await this.timelineService
      .recordChange({
        contactId: id,
        changeType: 'restored',
        fromStatus: 'deleting',
        toStatus: 'received',
        actorType: 'admin',
        source: 'manual',
      })
      .catch((err) => {
        this.logger.error(`Timeline record failed: ${err.message}`);
      });

    return { success: true };
  }

  /**
   * 10일 지난 삭제 건 영구삭제
   */
  async cleanup() {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const contactsToDelete = await this.prisma.contact.findMany({
      where: {
        deletedAt: { not: null, lte: tenDaysAgo },
      },
      select: { id: true },
    });

    if (contactsToDelete.length === 0) {
      return { deletedCount: 0, message: '삭제할 문의사항이 없습니다.' };
    }

    const ids = contactsToDelete.map((c) => c.id);
    await this.prisma.contact.deleteMany({
      where: { id: { in: ids } },
    });

    this.logger.log(`Permanently deleted ${ids.length} contacts`);

    return {
      deletedCount: ids.length,
      message: `${ids.length}개의 문의사항이 영구 삭제되었습니다.`,
    };
  }

  /**
   * 업체별 문의 목록 조회
   *
   * task 23 qa-contact-worker-v1: companyName 을 insensitive match 로 전환.
   * 자동생성 Contact 의 companyName 이 폴더명 원본이었던 레거시 데이터 + 대소문자/공백 변종까지 포함하도록 보강.
   * 완전히 다른 문자열(예: "대성목형" vs "대성목형(주)") 는 여전히 매칭 안 됨 — 필요 시 일회성 데이터 마이그레이션 별도 작업.
   */
  async findByCompany(query: CompanyContactsQueryDto) {
    const where: Prisma.ContactWhereInput = {
      companyName: { equals: query.companyName, mode: 'insensitive' },
      status: { not: 'deleting' },
      OR: [
        { splitCount: null }, // 분할되지 않은 일반 문의
        { splitCount: 0 }, // splitCount가 0인 경우
        { parentContactId: { not: null } }, // 하위 문의는 개별 노출
      ],
    };

    if (query.status) {
      where.status = query.status;
    }

    const contacts = await this.prisma.contact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });

    const webhardMetadata = await this.resolveContactWebhardMetadata(contacts);
    return contacts.map((c) => {
      const result = this.toSnakeCase(c as unknown as Record<string, unknown>);
      this.applyContactWebhardMetadata(result, c, webhardMetadata);
      return result;
    });
  }

  /**
   * 조건부 카운트
   */
  async count(query: CountContactDto): Promise<number> {
    const where: Prisma.ContactWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }
    if (query.companyName) {
      where.companyName = query.companyName;
    }
    if (query.inquiryNumberLike) {
      where.inquiryNumber = { startsWith: query.inquiryNumberLike };
    }
    if (query.originalFilename) {
      where.originalFilename = query.originalFilename;
    }

    return this.prisma.contact.count({ where });
  }

  /**
   * 중복 체크 (company_name + original_filename)
   */
  async findDuplicate(companyName: string, originalFilename: string) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        companyName,
        originalFilename,
        status: { not: 'deleting' },
      },
      select: { id: true },
    });

    return contact;
  }

  /**
   * 최근 문의 ID 목록
   */
  async getRecentIds(limit: number = 100): Promise<string[]> {
    const contacts = await this.prisma.contact.findMany({
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return contacts.map((c) => c.id);
  }

  /**
   * 배치 삭제 (테스트용, company_name LIKE 패턴)
   */
  async deleteBatchByCompanyPattern(pattern: string) {
    const contacts = await this.prisma.contact.findMany({
      where: { companyName: { startsWith: pattern } },
      select: { id: true },
    });

    if (contacts.length === 0) {
      return { deletedCount: 0, message: '삭제할 문의가 없습니다.' };
    }

    const ids = contacts.map((c) => c.id);
    await this.prisma.contact.deleteMany({
      where: { id: { in: ids } },
    });

    return {
      deletedCount: ids.length,
      message: `${ids.length}개의 문의가 삭제되었습니다.`,
    };
  }

  /**
   * 모든 문의 삭제 (개발 서버 전용)
   */
  async deleteAll() {
    const result = await this.prisma.contact.deleteMany({});

    this.logger.warn(`Permanently deleted ALL contacts: ${result.count}`);

    return {
      deletedCount: result.count,
      message:
        result.count > 0
          ? `${result.count}개의 모든 문의가 삭제되었습니다.`
          : '삭제할 문의가 없습니다.',
    };
  }

  private async resolveStoredFileDownload(
    rawUrl: string,
    fileName: string
  ): Promise<ContactDownloadResult> {
    const reference = parseStorageReference(rawUrl);
    if (reference.provider === StorageProvider.GOOGLE_DRIVE) {
      const webhardFile = await this.prisma.webhardFile.findFirst({
        where: {
          driveFileId: reference.idOrKey,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!webhardFile) {
        throw new NotFoundException('Drive 파일을 찾을 수 없습니다.');
      }

      return {
        url: '',
        fileName,
        provider: StorageProvider.GOOGLE_DRIVE,
        fileId: webhardFile.id,
      };
    }

    const key = extractR2Key(reference.idOrKey);
    const presigned = await this.storageService.getDownloadPresignedUrl(key, undefined, fileName);

    return {
      url: presigned.url,
      fileName,
      provider: StorageProvider.R2,
    };
  }

  /**
   * 첨부파일 다운로드 presigned URL 생성
   */
  async getDrawingDownloadUrl(id: string): Promise<ContactDownloadResult> {
    const contact = await this.prisma.contact.findFirst({
      where: { id },
      select: {
        drawingFileUrl: true,
        drawingFileName: true,
        inquiryNumber: true,
        workNumber: true,
        processStage: true,
        inquiryType: true,
      },
    });

    if (!contact) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }

    if (!contact.drawingFileUrl) {
      throw new BadRequestException('첨부 파일이 없습니다.');
    }

    const originalName = contact.drawingFileName || 'download';
    const downloadFileName = buildInquiryFileName({
      contact: {
        inquiryNumber: contact.inquiryNumber,
        workNumber: contact.workNumber,
        processStage: contact.processStage,
        inquiryType: contact.inquiryType,
      },
      originalName,
    });

    return this.resolveStoredFileDownload(contact.drawingFileUrl, downloadFileName);
  }

  /**
   * 파일 타입별 presigned URL 생성
   * type: 'attachment' | 'drawing' | 'revision_request' | 'reference_photo' | 'revision_request_history'
   */
  async getFileDownloadUrl(
    id: string,
    type: string,
    index?: number
  ): Promise<ContactDownloadResult> {
    const contact = await this.prisma.contact.findFirst({
      where: { id },
      select: {
        attachmentUrl: true,
        attachmentFilename: true,
        drawingFileUrl: true,
        drawingFileName: true,
        revisionRequestFileUrl: true,
        revisionRequestFileName: true,
        referencePhotosUrls: true,
        revisionRequestHistory: true,
        deliveryProofImage: true,
        inquiryNumber: true,
        workNumber: true,
        processStage: true,
        inquiryType: true,
      },
    });

    if (!contact) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }

    let rawUrl: string | null = null;
    let fileName = 'download';

    if (type === 'attachment') {
      rawUrl = contact.attachmentUrl ?? null;
      fileName = contact.attachmentFilename || 'download';
    } else if (type === 'drawing') {
      rawUrl = contact.drawingFileUrl ?? null;
      fileName = contact.drawingFileName || 'download';
    } else if (type === 'revision_request') {
      rawUrl = contact.revisionRequestFileUrl ?? null;
      fileName = contact.revisionRequestFileName || 'download';
    } else if (type === 'reference_photo') {
      if (!contact.referencePhotosUrls) {
        throw new BadRequestException('참고 사진이 없습니다.');
      }
      let urls: string[] = [];
      try {
        urls = JSON.parse(contact.referencePhotosUrls) as string[];
      } catch {
        throw new BadRequestException('참고 사진 데이터가 올바르지 않습니다.');
      }
      const idx = index ?? 0;
      if (idx < 0 || idx >= urls.length) {
        throw new BadRequestException('유효하지 않은 사진 인덱스입니다.');
      }
      rawUrl = urls[idx];
      fileName = `reference-photo-${idx + 1}.jpg`;
    } else if (type === 'revision_request_history') {
      if (!contact.revisionRequestHistory) {
        throw new BadRequestException('수정요청 기록이 없습니다.');
      }
      let history: Array<{ file_url?: string; file_name?: string }> = [];
      try {
        history = contact.revisionRequestHistory as Array<{
          file_url?: string;
          file_name?: string;
        }>;
      } catch {
        throw new BadRequestException('수정요청 기록 데이터가 올바르지 않습니다.');
      }
      const idx = index ?? 0;
      if (idx < 0 || idx >= history.length) {
        throw new BadRequestException('유효하지 않은 기록 인덱스입니다.');
      }
      const historyItem = history[idx];
      rawUrl = historyItem.file_url ?? null;
      fileName = historyItem.file_name || 'download';
    } else if (type === 'delivery_proof') {
      rawUrl = contact.deliveryProofImage ?? null;
      fileName = 'delivery-proof.webp';
    } else {
      throw new BadRequestException(`지원하지 않는 파일 타입입니다: ${type}`);
    }

    if (!rawUrl) {
      throw new BadRequestException('해당 파일이 없습니다.');
    }

    // 파일명 앞에 번호 prefix: processStage + inquiryType 기반 (buildInquiryFileName)
    const downloadFileName = buildInquiryFileName({
      contact: {
        inquiryNumber: contact.inquiryNumber,
        workNumber: contact.workNumber,
        processStage: contact.processStage,
        inquiryType: contact.inquiryType,
      },
      originalName: fileName,
    });

    return this.resolveStoredFileDownload(rawUrl, downloadFileName);
  }

  /**
   * 웹하드 정보 조회 (폴더 경로, ID)
   */
  async getWebhardInfo(id: string): Promise<{
    folderId: string | null;
    folderPath: string | null;
    folderName: string | null;
    fileId: string | null;
  }> {
    const contact = await this.prisma.contact.findFirst({
      where: { id },
      select: { webhardFolderId: true, drawingFileUrl: true, drawingFileName: true },
    });

    if (!contact) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }

    if (!contact.webhardFolderId) {
      return { folderId: null, folderPath: null, folderName: null, fileId: null };
    }

    // 폴더 정보 조회
    const folder = await this.prisma.webhardFolder.findUnique({
      where: { id: contact.webhardFolderId },
      select: { id: true, name: true, path: true },
    });

    // 파일 ID 조회 (drawingFileName으로 매칭)
    let fileId: string | null = null;
    if (contact.drawingFileName && contact.webhardFolderId) {
      const file = await this.prisma.webhardFile.findFirst({
        where: {
          folderId: contact.webhardFolderId,
          originalName: contact.drawingFileName,
          deletedAt: null,
        },
        select: { id: true },
      });
      fileId = file?.id ?? null;
    }

    // 폴더 경로 빌드
    let folderPath = folder?.path || null;
    if (!folderPath && folder) {
      // path가 없으면 ancestor chain으로 빌드
      const ancestors: string[] = [];
      let current = folder as { id: string; name: string; parentId?: string | null } | null;
      let parentId: string | null = null;

      // 현재 폴더의 parentId 조회
      const fullFolder = await this.prisma.webhardFolder.findUnique({
        where: { id: folder.id },
        select: { parentId: true },
      });
      parentId = fullFolder?.parentId ?? null;

      ancestors.unshift(folder.name);
      let depth = 0;
      while (parentId && depth < 10) {
        current = await this.prisma.webhardFolder.findUnique({
          where: { id: parentId },
          select: { id: true, name: true, parentId: true },
        });
        if (!current) break;
        ancestors.unshift(current.name);
        parentId = current.parentId ?? null;
        depth++;
      }

      folderPath = '/' + ancestors.join('/');
    }

    return {
      folderId: folder?.id ?? null,
      folderPath,
      folderName: folder?.name ?? null,
      fileId,
    };
  }

  // ========== Helper Methods ==========

  private mapSortField(field: string): string {
    const fieldMap: Record<string, string> = {
      created_at: 'createdAt',
      createdAt: 'createdAt',
      updated_at: 'updatedAt',
      updatedAt: 'updatedAt',
      company_name: 'companyName',
      companyName: 'companyName',
      status: 'status',
    };
    return fieldMap[field] || 'createdAt';
  }

  /**
   * Prisma camelCase → API snake_case 변환
   */
  /**
   * 문의 분할 (N개 하위 문의 생성)
   */
  async splitContact(id: string, dto: SplitContactDto) {
    const contact = await this.prisma.contact.findUnique({ where: { id } });
    if (!contact) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }
    if (contact.parentContactId !== null) {
      throw new BadRequestException('하위 문의는 분할할 수 없습니다');
    }
    if (contact.splitCount !== null) {
      throw new BadRequestException('이미 분할된 문의입니다');
    }
    const splittableStages = [null, 'drawing', 'drawing_confirmed'];
    if (!splittableStages.includes(contact.processStage)) {
      throw new BadRequestException('도면작업 또는 도면확정 단계에서만 분할할 수 있습니다');
    }

    const now = new Date();

    const children = await this.prisma.$transaction(async (tx) => {
      const created: (typeof contact)[] = [];

      for (let i = 1; i <= dto.count; i++) {
        const child = await tx.contact.create({
          data: {
            name: contact.name,
            email: contact.email,
            phone: contact.phone,
            companyName: contact.companyName,
            position: contact.position,
            inquiryType: contact.inquiryType,
            contactType: contact.contactType,
            source: contact.source,
            orderType: contact.orderType,
            isUrgent: contact.isUrgent,
            boxShape: contact.boxShape,
            material: contact.material,
            length: contact.length,
            width: contact.width,
            height: contact.height,
            deliveryMethod: contact.deliveryMethod,
            deliveryAddress: contact.deliveryAddress,
            deliveryName: contact.deliveryName,
            deliveryPhone: contact.deliveryPhone,
            deliveryType: contact.deliveryType,
            deliveryCompanyName: contact.deliveryCompanyName,
            deliveryCompanyPhone: contact.deliveryCompanyPhone,
            deliveryCompanyAddress: contact.deliveryCompanyAddress,
            deliveryNote: contact.deliveryNote,
            receiptMethod: contact.receiptMethod,
            parentContactId: contact.id,
            splitIndex: i,
            // 도면작업 단계: inquiryNumber(O) 기준, 도면확정 단계: workNumber(F) 기준
            inquiryNumber:
              contact.processStage === 'drawing_confirmed'
                ? contact.inquiryNumber
                  ? `${contact.inquiryNumber}-${i}`
                  : null
                : contact.inquiryNumber
                  ? `${contact.inquiryNumber}-${i}`
                  : null,
            workNumber:
              contact.processStage === 'drawing_confirmed'
                ? contact.workNumber
                  ? `${contact.workNumber}-${i}`
                  : null
                : null,
            subject: dto.items?.[i - 1]?.subject ?? `${contact.subject || ''} (${i})`,
            message: dto.items?.[i - 1]?.description ?? null,
            status: contact.status,
            processStage: contact.processStage,
            stageCompleted: false,
            drawingFileUrl: null,
            drawingFileName: null,
            createdAt: now,
          },
        });

        // 자식별 폴더 생성 — 중간 `문의/` 폴더 하위에 `{부모O}-{i}` (독립 동급).
        // 번호 발급·이름 계산은 ensureInquiryFolder 가 child.inquiryNumber/workNumber 로 수행.
        // 부모 `{부모O}` 폴더는 건드리지 않음.
        if (child.inquiryType) {
          await this.foldersService.ensureInquiryFolder(child.id, tx);
        }

        created.push(child);
      }

      await tx.contact.update({
        where: { id },
        data: { splitCount: dto.count, updatedAt: now },
      });

      return created;
    });

    const childIds = children.map((c) => c.id);

    // Timeline: fire-and-forget (non-blocking)
    await this.timelineService
      .recordChange({
        contactId: id,
        changeType: 'split',
        actorType: 'admin',
        source: 'manual',
        companyName: contact.companyName || undefined,
        metadata: { splitCount: dto.count, childIds },
      })
      .catch((err) => {
        this.logger.error(
          `Timeline record failed for split: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    for (const child of children) {
      await this.timelineService
        .recordChange({
          contactId: child.id,
          changeType: 'created',
          toStatus: child.status || 'received',
          actorType: 'admin',
          source: 'manual',
          companyName: child.companyName || undefined,
          metadata: { parentContactId: id, splitIndex: child.splitIndex },
        })
        .catch((err) => {
          this.logger.error(
            `Timeline record failed for child: ${err instanceof Error ? err.message : String(err)}`
          );
        });
    }

    // WebSocket event
    this.contactsGateway.emitContactSplit({
      parentId: id,
      childIds,
      splitCount: dto.count,
    });

    return children.map((c) => this.toSnakeCase(c as unknown as Record<string, unknown>));
  }

  /**
   * 하위 문의 목록 조회 (splitIndex ASC)
   */
  async getChildren(parentId: string) {
    const children = await this.prisma.contact.findMany({
      where: { parentContactId: parentId },
      orderBy: { splitIndex: 'asc' },
      include: {
        workerNotes: true,
        drawingRevisions: true,
      },
    });
    return children.map((c) => {
      const record = c as unknown as Record<string, unknown>;
      const result = this.toSnakeCase(record);
      // include 된 drawingRevisions 중 최신(version desc) 의 webhardFileIds[0] 을 사용 (task 22).
      const revisions = Array.isArray(record['drawingRevisions'])
        ? (record['drawingRevisions'] as Array<{
            version: number;
            webhardFileIds?: string[] | null;
          }>)
        : [];
      const latest = [...revisions].sort((a, b) => b.version - a.version)[0];
      result['webhard_file_id'] = latest?.webhardFileIds?.[0] ?? null;
      return result;
    });
  }

  /**
   * 단계 완료 체크 토글 (분할 하위 문의 전용)
   */
  async toggleStageCompleted(id: string, dto: ToggleStageCompletedDto) {
    const contact = await this.prisma.contact.findUnique({ where: { id } });
    if (!contact) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }
    if (contact.parentContactId === null) {
      throw new BadRequestException('분할 하위 문의에서만 단계 완료 체크를 사용할 수 있습니다.');
    }

    const updated = await this.prisma.contact.update({
      where: { id },
      data: { stageCompleted: dto.stageCompleted, updatedAt: new Date() },
    });

    // Timeline: fire-and-forget
    await this.timelineService
      .recordChange({
        contactId: id,
        changeType: 'stage_completed_toggle',
        actorType: 'admin',
        source: 'manual',
        companyName: contact.companyName || undefined,
        metadata: { stageCompleted: dto.stageCompleted },
      })
      .catch((err) => {
        this.logger.error(
          `Timeline record failed for stage_completed_toggle: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    // 부모 타임라인 기록 (fire-and-forget)
    if (contact.parentContactId) {
      await this.timelineService
        .recordChange({
          contactId: contact.parentContactId,
          changeType: 'stage_completed_toggle',
          actorType: 'admin',
          source: 'manual',
          companyName: contact.companyName || undefined,
          metadata: {
            childContactId: id,
            childInquiryNumber: contact.inquiryNumber || contact.workNumber || id,
            stageCompleted: dto.stageCompleted,
          },
        })
        .catch((err) => {
          this.logger.error(
            `Timeline record failed for parent stage_completed_toggle: ${err instanceof Error ? err.message : String(err)}`
          );
        });
    }

    // 부모+children 재조회하여 소켓 이벤트 발행 (fire-and-forget)
    if (contact.parentContactId) {
      this.prisma.contact
        .findUnique({
          where: { id: contact.parentContactId },
          include: {
            children: {
              where: { deletedAt: null },
              orderBy: { splitIndex: 'asc' },
            },
            workerNotes: { orderBy: { createdAt: 'desc' } },
          },
        })
        .then((parent) => {
          if (parent) {
            const parentResult = this.toSnakeCase(parent as unknown as Record<string, unknown>);
            if (Array.isArray((parent as unknown as Record<string, unknown>)['children'])) {
              parentResult['children'] = (
                (parent as unknown as Record<string, unknown>)['children'] as Record<
                  string,
                  unknown
                >[]
              ).map((child) => this.toSnakeCase(child));
            }
            this.contactsGateway.emitContactUpdated(parentResult);
          }
        })
        .catch((err) => {
          this.logger.error(
            `Socket emit failed for toggleStageCompleted: ${err instanceof Error ? err.message : String(err)}`
          );
        });
    }

    return this.toSnakeCase(updated as unknown as Record<string, unknown>);
  }

  /**
   * 그룹 일괄 다음 단계 이동
   */
  async advanceSplitGroupStage(parentId: string, dto: AdvanceSplitGroupStageDto) {
    // 1. 원본 Contact 검증
    const parent = await this.prisma.contact.findUnique({ where: { id: parentId } });
    if (!parent) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }
    if (!parent.splitCount || parent.splitCount <= 0) {
      throw new BadRequestException('분할된 문의가 아닙니다.');
    }

    // 2. 자식 문의 조회
    const children = await this.prisma.contact.findMany({
      where: { parentContactId: parentId, deletedAt: null },
      orderBy: { splitIndex: 'asc' },
    });

    if (children.length === 0) {
      throw new BadRequestException('하위 문의가 존재하지 않습니다.');
    }

    // 3. 모든 자식의 stageCompleted 확인
    const incompleteCount = children.filter((c) => !c.stageCompleted).length;
    if (incompleteCount > 0) {
      if (dto.forceComplete) {
        // forceComplete: 미완료 자식을 모두 완료 처리
        await this.prisma.contact.updateMany({
          where: {
            parentContactId: parentId,
            deletedAt: null,
            stageCompleted: false,
          },
          data: { stageCompleted: true, updatedAt: new Date() },
        });
      } else {
        throw new BadRequestException(
          `모든 하위 문의의 현재 단계가 완료되어야 합니다. 미완료: ${incompleteCount}건`
        );
      }
    }

    // 4. 공정 단계 순서 검증
    const currentStage = children[0].processStage;
    if (!currentStage) {
      throw new BadRequestException('현재 공정 단계가 설정되지 않았습니다.');
    }
    if (!isValidStageTransition(currentStage, dto.nextStage)) {
      throw new BadRequestException(
        `유효하지 않은 단계 이동입니다: ${currentStage} → ${dto.nextStage}`
      );
    }

    // 5. nextStage가 유효한 단계인지 확인
    if (!PROCESS_STAGE_ORDER.includes(dto.nextStage)) {
      throw new BadRequestException(`유효하지 않은 공정 단계입니다: ${dto.nextStage}`);
    }

    const now = new Date();

    // 5-1. 현장작업 전환 시 workNumber 자동 부여
    // drawing_confirmed 이상으로 진행할 때, 자식에 workNumber가 없으면 생성
    const FIELD_STAGES = ['drawing_confirmed', 'laser', 'cutting', 'creasing', 'delivery'];
    const needsWorkNumber =
      FIELD_STAGES.includes(dto.nextStage) && children.some((c) => !c.workNumber);
    let baseWorkNumber: string | null = null;
    if (needsWorkNumber) {
      // 부모에 workNumber가 있으면 활용, 없으면 새로 채번
      if (parent.workNumber) {
        baseWorkNumber = parent.workNumber;
      } else {
        baseWorkNumber = await this.numberService.generateNumber('work');
        // 부모에도 workNumber 기록
        await this.prisma.contact.update({
          where: { id: parentId },
          data: { workNumber: baseWorkNumber, updatedAt: now },
        });
      }
    }

    // 6. 일괄 업데이트 (트랜잭션)
    const updatedChildren = await this.prisma.$transaction(async (tx) => {
      const results: (typeof children)[number][] = [];
      for (const child of children) {
        const updateData: Prisma.ContactUpdateInput = {
          processStage: dto.nextStage,
          stageCompleted: false,
          updatedAt: now,
        };

        // 현장작업 전환 시 workNumber 부여
        if (baseWorkNumber && !child.workNumber) {
          updateData.workNumber = `${baseWorkNumber}-${child.splitIndex}`;
        }

        // 공정 단계에 맞는 타임스탬프 필드 업데이트
        if (dto.nextStage === 'drawing_confirmed') {
          updateData.confirmedAt = now;
          updateData.productionStartedAt = now;
        } else if (dto.nextStage === 'cutting') {
          updateData.cuttingStartedAt = now;
        } else if (dto.nextStage === 'creasing') {
          updateData.cuttingCompletedAt = now;
          updateData.finishingStartedAt = now;
        } else if (dto.nextStage === 'delivery') {
          updateData.finishingCompletedAt = now;
        }

        const updated = await tx.contact.update({
          where: { id: child.id },
          data: updateData,
        });
        results.push(updated);
      }
      return results;
    });

    // 6-1. 부모 문의도 동일한 공정 단계로 업데이트
    const parentUpdateData: Prisma.ContactUpdateInput = {
      processStage: dto.nextStage,
      updatedAt: now,
    };
    if (dto.nextStage === 'drawing_confirmed') {
      parentUpdateData.confirmedAt = now;
      parentUpdateData.productionStartedAt = now;
    } else if (dto.nextStage === 'cutting') {
      parentUpdateData.cuttingStartedAt = now;
    } else if (dto.nextStage === 'creasing') {
      parentUpdateData.cuttingCompletedAt = now;
      parentUpdateData.finishingStartedAt = now;
    } else if (dto.nextStage === 'delivery') {
      parentUpdateData.finishingCompletedAt = now;
    }
    await this.prisma.contact.update({
      where: { id: parentId },
      data: parentUpdateData,
    });

    // 7. 타임라인 기록: fire-and-forget
    for (const child of children) {
      await this.timelineService
        .recordChange({
          contactId: child.id,
          changeType: 'process_stage_change',
          fromStage: child.processStage,
          toStage: dto.nextStage,
          actorType: (dto.actorType as 'admin' | 'company' | 'worker') || 'admin',
          actorName: dto.actorName,
          companyName: child.companyName || undefined,
          source: 'manual',
          metadata: { groupAdvance: true, parentContactId: parentId },
        })
        .catch((err) => {
          this.logger.error(
            `Timeline record failed for group advance: ${err instanceof Error ? err.message : String(err)}`
          );
        });
    }

    // 부모 타임라인 기록 (fire-and-forget)
    await this.timelineService
      .recordChange({
        contactId: parentId,
        changeType: 'process_stage_change',
        fromStage: currentStage,
        toStage: dto.nextStage,
        actorType: (dto.actorType as 'admin' | 'company' | 'worker') || 'admin',
        actorName: dto.actorName,
        companyName: parent.companyName || undefined,
        source: 'manual',
        metadata: {
          groupAdvance: true,
          childCount: children.length,
          forceComplete: dto.forceComplete || false,
        },
      })
      .catch((err) => {
        this.logger.error(
          `Timeline record failed for parent group advance: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    // 8. WebSocket 이벤트
    this.contactsGateway.emitGroupStageAdvanced({
      parentId,
      childIds: children.map((c) => c.id),
      nextStage: dto.nextStage,
    });

    // 부모+children 재조회하여 contact:updated 발행 (fire-and-forget)
    this.prisma.contact
      .findUnique({
        where: { id: parentId },
        include: {
          children: {
            where: { deletedAt: null },
            orderBy: { splitIndex: 'asc' },
          },
          workerNotes: { orderBy: { createdAt: 'desc' } },
        },
      })
      .then((updatedParent) => {
        if (updatedParent) {
          const parentResult = this.toSnakeCase(
            updatedParent as unknown as Record<string, unknown>
          );
          if (Array.isArray((updatedParent as unknown as Record<string, unknown>)['children'])) {
            parentResult['children'] = (
              (updatedParent as unknown as Record<string, unknown>)['children'] as Record<
                string,
                unknown
              >[]
            ).map((child) => this.toSnakeCase(child));
          }
          this.contactsGateway.emitContactUpdated(parentResult);
        }
      })
      .catch((err) => {
        this.logger.error(
          `Socket emit failed for advanceSplitGroupStage: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    return {
      children: updatedChildren.map((c) =>
        this.toSnakeCase(c as unknown as Record<string, unknown>)
      ),
      nextStage: dto.nextStage,
    };
  }

  private toSnakeCase(contact: Record<string, unknown>): Record<string, unknown> {
    const mapping: Record<string, string> = {
      id: 'id',
      name: 'name',
      email: 'email',
      phone: 'phone',
      companyName: 'company_name',
      position: 'position',
      subject: 'subject',
      message: 'message',
      status: 'status',
      contactType: 'contact_type',
      source: 'source',
      inquiryType: 'inquiry_type',
      inquiryNumber: 'inquiry_number',
      inquiryTitle: 'inquiry_title',
      workNumber: 'work_number',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at',
      isRead: 'is_read',
      previousStatus: 'previous_status',
      orderType: 'order_type',
      memo: 'memo',
      originalFilename: 'original_filename',
      drawingFileUrl: 'drawing_file_url',
      drawingFileName: 'drawing_file_name',
      drawingType: 'drawing_type',
      referencePhotosUrls: 'reference_photos_urls',
      drawingModification: 'drawing_modification',
      drawingNotes: 'drawing_notes',
      drawingFileCount: 'drawing_file_count',
      boxShape: 'box_shape',
      length: 'length',
      width: 'width',
      height: 'height',
      material: 'material',
      hasPhysicalSample: 'has_physical_sample',
      hasReferencePhotos: 'has_reference_photos',
      sampleNotes: 'sample_notes',
      deliveryMethod: 'delivery_method',
      deliveryAddress: 'delivery_address',
      deliveryName: 'delivery_name',
      deliveryPhone: 'delivery_phone',
      deliveryType: 'delivery_type',
      deliveryCompanyName: 'delivery_company_name',
      deliveryCompanyPhone: 'delivery_company_phone',
      deliveryCompanyAddress: 'delivery_company_address',
      deliveryNote: 'delivery_note',
      deliveryMethodChangedAt: 'delivery_method_changed_at',
      receiptMethod: 'receipt_method',
      deliveryProofImage: 'delivery_proof_image',
      deliveryCompleteImage: 'delivery_complete_image',
      revisionRequestTitle: 'revision_request_title',
      revisionRequestContent: 'revision_request_content',
      revisionRequestedAt: 'revision_requested_at',
      revisionRequestFileUrl: 'revision_request_file_url',
      revisionRequestFileName: 'revision_request_file_name',
      revisionRequestHistory: 'revision_request_history',
      portfolioReferenceId: 'portfolio_reference_id',
      portfolioReferenceTitle: 'portfolio_reference_title',
      portfolioReferenceField: 'portfolio_reference_field',
      portfolioReferenceType: 'portfolio_reference_type',
      portfolioReferenceFormat: 'portfolio_reference_format',
      portfolioReferenceSize: 'portfolio_reference_size',
      portfolioReferencePaper: 'portfolio_reference_paper',
      portfolioReferencePrinting: 'portfolio_reference_printing',
      portfolioReferenceFinishing: 'portfolio_reference_finishing',
      portfolioReferenceImage: 'portfolio_reference_image',
      portfolioReferenceUrl: 'portfolio_reference_url',
      portfolioReferenceInfo: 'portfolio_reference_info',
      processStage: 'process_stage',
      confirmedAt: 'confirmed_at',
      productionStartedAt: 'production_started_at',
      cuttingStartedAt: 'cutting_started_at',
      cuttingCompletedAt: 'cutting_completed_at',
      finishingStartedAt: 'finishing_started_at',
      finishingCompletedAt: 'finishing_completed_at',
      scheduledAutoCompleteAt: 'scheduled_auto_complete_at',
      bookingChangedAt: 'booking_changed_at',
      dxfClassifiedCount: 'dxf_classified_count',
      dxfTotalPrice: 'dxf_total_price',
      nestingSheetCount: 'nesting_sheet_count',
      nestingUtilization: 'nesting_utilization',
      workerMemo: 'worker_memo',
      workerIssue: 'worker_issue',
      workerMemoAt: 'worker_memo_at',
      workerMemoBy: 'worker_memo_by',
      isUrgent: 'is_urgent',
      urgentAt: 'urgent_at',
      workerNotes: 'worker_notes',
      webhardFolderId: 'webhard_folder_id',
      referralSource: 'referral_source',
      visitLocation: 'visit_location',
      visitDate: 'visit_date',
      visitTimeSlot: 'visit_time_slot',
      serviceMoldRequest: 'service_mold_request',
      serviceDeliveryBrokerage: 'service_delivery_brokerage',
      attachmentFilename: 'attachment_filename',
      attachmentUrl: 'attachment_url',
      parentContactId: 'parent_contact_id',
      splitIndex: 'split_index',
      splitCount: 'split_count',
      stageCompleted: 'stage_completed',
      drawingRevisions: 'drawing_revisions',
    };

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(contact)) {
      const snakeKey = mapping[key] || key;
      // Convert Date objects to ISO strings
      if (value instanceof Date) {
        result[snakeKey] = value.toISOString();
      } else if (key === 'workerNotes' && Array.isArray(value)) {
        result['worker_notes'] = value.map((entry) =>
          this.toWorkerNoteDto(entry as WorkerNoteRecord)
        );
      } else if (key === 'statusHistory' && Array.isArray(value)) {
        // Nested relation: statusHistory → status_history (snake_case 변환)
        result['status_history'] = value.map((entry: Record<string, unknown>) => ({
          id: entry.id,
          contact_id: entry.contactId,
          change_type: entry.changeType,
          from_status: entry.fromStatus ?? null,
          to_status: entry.toStatus ?? null,
          from_stage: entry.fromStage ?? null,
          to_stage: entry.toStage ?? null,
          actor_type: entry.actorType,
          actor_name: entry.actorName ?? null,
          company_name: entry.companyName ?? null,
          company_id: entry.companyId ?? null,
          source: entry.source,
          note: entry.note ?? null,
          metadata: entry.metadata ?? {},
          created_at:
            entry.createdAt instanceof Date ? entry.createdAt.toISOString() : entry.createdAt,
        }));
      } else {
        result[snakeKey] = value;
      }
    }
    return result;
  }

  private formatDateLike(value: unknown): string | null {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    return null;
  }

  private toWorkerNoteDto(note: WorkerNoteRecord): Record<string, unknown> {
    return {
      id: note.id,
      contact_id: note.contact_id ?? note.contactId,
      type: note.type,
      content: note.content,
      created_by: note.created_by ?? note.createdBy,
      created_at: this.formatDateLike(note.created_at ?? note.createdAt),
      updated_at: this.formatDateLike(note.updated_at ?? note.updatedAt),
    };
  }

  // === Worker Notes CRUD ===

  async getWorkerNotes(contactId: string) {
    const notes = await this.prisma.workerNote.findMany({
      where: { contactId },
      orderBy: { createdAt: 'desc' },
    });
    return notes.map((note) => this.toWorkerNoteDto(note));
  }

  async addWorkerNote(contactId: string, dto: CreateWorkerNoteDto) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, companyName: true, inquiryNumber: true, workNumber: true },
    });
    if (!contact) throw new NotFoundException('문의를 찾을 수 없습니다.');

    const count = await this.prisma.workerNote.count({ where: { contactId } });
    if (count >= 3) {
      throw new BadRequestException('최대 3개까지 작성 가능합니다.');
    }

    const note = await this.prisma.workerNote.create({
      data: {
        contactId,
        type: dto.type,
        content: dto.content,
        createdBy: dto.createdBy,
      },
    });

    this.contactsGateway.emitContactUpdated({ id: contactId });
    const notificationType =
      dto.type === 'issue'
        ? 'worker_issue_added'
        : dto.type === 'request'
          ? 'worker_request_added'
          : 'worker_note_added';
    const title =
      dto.type === 'issue'
        ? '작업 이슈 등록'
        : dto.type === 'request'
          ? '작업 요청 등록'
          : '작업 메모 추가';
    await this.createAdminContactNotification({
      type: notificationType,
      title,
      message: `${contact.companyName || '업체 미확인'}: ${dto.content}`,
      contactId,
      companyName: contact.companyName,
      metadata: {
        noteId: note.id,
        noteType: dto.type,
        createdBy: dto.createdBy,
        inquiryNumber: contact.inquiryNumber,
        workNumber: contact.workNumber,
      },
    });
    return this.toWorkerNoteDto(note);
  }

  async deleteWorkerNote(contactId: string, noteId: number) {
    const note = await this.prisma.workerNote.findFirst({
      where: { id: noteId, contactId },
      select: { id: true },
    });
    if (!note) throw new NotFoundException('노트를 찾을 수 없습니다.');

    await this.prisma.workerNote.delete({ where: { id: noteId } });
    this.contactsGateway.emitContactUpdated({ id: contactId });
    return { success: true };
  }

  private buildDeliveryProofFileName(
    deliveredAt: Date,
    originalName?: string,
    mimeType?: string
  ): string {
    const kstDate = new Date(deliveredAt.getTime() + 9 * 60 * 60 * 1000);
    const stamp = kstDate.toISOString();
    const date = stamp.slice(0, 10).replace(/-/g, '');
    const time = stamp.slice(11, 19).replace(/:/g, '');
    const extension = this.resolveDeliveryProofExtension(originalName, mimeType);
    return `납품완료_${date}_${time}.${extension}`;
  }

  private resolveDeliveryProofExtension(originalName?: string, mimeType?: string): string {
    const extensionFromName = originalName?.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
    if (extensionFromName && /^[a-z0-9]{1,10}$/.test(extensionFromName)) {
      return extensionFromName;
    }

    switch (mimeType) {
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      case 'image/heic':
        return 'heic';
      case 'image/heif':
        return 'heif';
      case 'image/jpeg':
      case 'image/jpg':
      default:
        return 'jpg';
    }
  }

  private resolveDeliveryProofMimeType(mimeType?: string, fileName?: string): string {
    if (mimeType) return mimeType;
    const extension = this.resolveDeliveryProofExtension(fileName);
    switch (extension) {
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'heic':
        return 'image/heic';
      case 'heif':
        return 'image/heif';
      case 'jpg':
      case 'jpeg':
      default:
        return 'image/jpeg';
    }
  }

  private resolveDeliveryProofUploadedBy(actor: TimelineActor): string {
    if (actor.actorName?.trim()) return actor.actorName.trim();
    if (actor.actorType === 'worker') return '작업자';
    if (actor.actorType === 'admin') return '관리자';
    if (actor.actorType === 'company') return '업체';
    return 'system';
  }

  private async syncDeliveryProofToWebhard(
    contacts: DeliveryProofContact[],
    dto: BatchStartDeliveryDto,
    actor: TimelineActor,
    deliveredAt: Date
  ): Promise<void> {
    if (!dto.deliveryProofImage) return;

    const displayName = this.buildDeliveryProofFileName(
      deliveredAt,
      dto.deliveryProofOriginalName,
      dto.deliveryProofMimeType
    );
    const mimeType = this.resolveDeliveryProofMimeType(dto.deliveryProofMimeType, displayName);
    const size = BigInt(dto.deliveryProofFileSize ?? 0);
    const r2Key = extractR2Key(dto.deliveryProofImage);
    const uploadedBy = this.resolveDeliveryProofUploadedBy(actor);

    for (const contact of contacts) {
      try {
        const folder = (await this.foldersService.ensureInquiryFolder(
          contact.id
        )) as DeliveryProofFolder | null;

        if (!folder) {
          this.logger.warn(
            `Delivery proof webhard sync skipped: inquiry folder missing for contactId=${contact.id}`
          );
          continue;
        }

        try {
          await this.foldersService.moveInquiryFolderToCompleted(contact.id);
        } catch (error) {
          this.logger.warn(
            `moveInquiryFolderToCompleted failed during delivery proof sync for contactId=${contact.id}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }

        const driveUpload = await this.copyR2SourceToDriveIfReady({
          key: r2Key,
          fileName: displayName,
          mimeType,
          folder,
        });

        const created = await this.prisma.webhardFile.create({
          data: {
            name: displayName,
            originalName: dto.deliveryProofOriginalName ?? displayName,
            size: BigInt(driveUpload?.size ?? Number(size)),
            mimeType: driveUpload?.mimeType ?? mimeType,
            path: driveUpload ? `${folder.id}/${displayName}` : r2Key,
            storageProvider: driveUpload ? StorageProvider.GOOGLE_DRIVE : StorageProvider.R2,
            driveFileId: driveUpload?.storageFileId ?? null,
            driveMimeType: driveUpload?.mimeType ?? null,
            folderId: folder.id,
            companyId: folder.companyId,
            uploadedBy,
            inquiryNumber: contact.workNumber ?? contact.inquiryNumber ?? null,
          },
        });

        this.eventsGateway.emitToFolder(folder.id, {
          type: 'file:created',
          folderId: folder.id,
          data: { fileId: created.id, contactId: contact.id },
        });
      } catch (error) {
        this.logger.warn(
          `Delivery proof webhard sync failed for contactId=${contact.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  async toggleUrgent(contactId: string, actor?: TimelineActor) {
    const { updated, nextIsUrgent } = await this.prisma.$transaction(async (tx) => {
      const contact = await tx.contact.findUnique({
        where: { id: contactId },
        select: { id: true, isUrgent: true, companyName: true, companyId: true },
      });
      if (!contact) throw new NotFoundException('문의를 찾을 수 없습니다.');

      const isCurrentlyUrgent = contact.isUrgent === true;
      const nextUrgentState = !isCurrentlyUrgent;
      const updatedContact = await tx.contact.update({
        where: { id: contactId },
        data: {
          isUrgent: nextUrgentState,
          urgentAt: nextUrgentState ? new Date() : null,
        },
      });

      await this.timelineService.recordChange({
        contactId,
        changeType: 'urgent_toggle',
        fromStatus: isCurrentlyUrgent ? 'urgent' : 'normal',
        toStatus: nextUrgentState ? 'urgent' : 'normal',
        actorType: actor?.actorType ?? 'admin',
        actorName: actor?.actorName,
        companyName: actor?.companyName ?? contact.companyName ?? undefined,
        companyId: actor?.companyId ?? contact.companyId ?? undefined,
        source: 'manual',
        metadata: {
          isUrgent: nextUrgentState,
        },
        tx,
      });

      return { updated: updatedContact, nextIsUrgent: nextUrgentState };
    });

    const result = this.toSnakeCase(updated as unknown as Record<string, unknown>);
    this.contactsGateway.emitContactUpdated(result);
    if (nextIsUrgent) {
      await this.createAdminContactNotification({
        type: 'contact_urgent',
        title: '긴급 문의 지정',
        message: '작업자가 문의를 긴급으로 지정했습니다.',
        contactId,
      });
    }
    return result;
  }

  // === Batch Delivery ===

  async batchStartDeliveryWithDriveProof(
    dto: BatchStartDeliveryDto,
    file: UploadedContactDriveFile
  ) {
    const startedAt = Date.now();
    const results: Array<{ contactId: string; success: boolean; error?: string }> = [];

    const actor: TimelineActor = {
      actorType: (dto.actorType as 'admin' | 'company' | 'worker') || 'worker',
      actorName: dto.actorName,
    };

    this.logger.log(
      `Drive delivery proof batch start: contacts=${dto.contactIds.length}, fileSize=${file.size}`
    );

    const existingContacts = await this.prisma.executeWithRetry(
      () =>
        this.prisma.contact.findMany({
          where: { id: { in: dto.contactIds } },
          select: {
            id: true,
            processStage: true,
            status: true,
            companyName: true,
            inquiryNumber: true,
            workNumber: true,
          },
        }),
      { operationName: 'contacts.batchStartDeliveryWithDriveProof.findMany' }
    );

    const existingMap = new Map(existingContacts.map((c) => [c.id, c]));
    const validContactIds: string[] = [];
    for (const contactId of dto.contactIds) {
      const existing = existingMap.get(contactId);

      if (!existing) {
        results.push({ contactId, success: false, error: '문의를 찾을 수 없습니다.' });
        continue;
      }

      if (existing.processStage !== 'delivery') {
        results.push({
          contactId,
          success: false,
          error: `공정 단계가 delivery가 아닙니다 (현재: ${existing.processStage}).`,
        });
        continue;
      }

      if (existing.status === 'delivered') {
        results.push({ contactId, success: false, error: '이미 납품완료 상태입니다.' });
        continue;
      }

      validContactIds.push(contactId);
    }

    const now = new Date();
    const proofReferences = new Map<string, string>();
    for (const contactId of validContactIds) {
      const existing = existingMap.get(contactId)!;
      try {
        const uploaded = await this.uploadDeliveryProofBufferToDrive(
          {
            id: existing.id,
            inquiryNumber: existing.inquiryNumber,
            workNumber: existing.workNumber,
          },
          file,
          actor,
          now
        );
        proofReferences.set(contactId, uploaded.reference);
      } catch (error) {
        results.push({
          contactId,
          success: false,
          error: error instanceof Error ? error.message : '납품증빙 업로드 실패',
        });
      }
    }

    const readyContactIds = validContactIds.filter((contactId) => proofReferences.has(contactId));
    if (readyContactIds.length > 0) {
      try {
        const txOperations = readyContactIds.flatMap((contactId) => {
          const existing = existingMap.get(contactId)!;
          const deliveryProofImage = proofReferences.get(contactId)!;
          return [
            this.prisma.contact.update({
              where: { id: contactId },
              data: {
                status: 'delivered',
                processStage: null,
                deliveryProofImage,
                updatedAt: now,
              },
            }),
            this.prisma.contactStatusHistory.create({
              data: {
                contactId,
                changeType: 'status_change',
                fromStatus: existing.status,
                toStatus: 'delivered',
                actorType: actor.actorType || 'worker',
                actorName: actor.actorName ?? null,
                companyName: existing.companyName ?? null,
                source: 'manual',
                note: '납품 완료 (사진 첨부)',
                metadata: {},
              },
            }),
            this.prisma.contactStatusHistory.create({
              data: {
                contactId,
                changeType: 'process_stage_change',
                fromStage: 'delivery',
                toStage: null,
                actorType: actor.actorType || 'worker',
                actorName: actor.actorName ?? null,
                companyName: existing.companyName ?? null,
                source: 'manual',
                note: '납품완료 — 즉시 처리',
                metadata: {},
              },
            }),
          ];
        });

        await this.prisma.executeWithRetry(() => this.prisma.$transaction(txOperations), {
          operationName: 'contacts.batchStartDeliveryWithDriveProof.transaction',
        });

        for (const contactId of readyContactIds) {
          results.push({ contactId, success: true });
        }

        this.contactsGateway.emitBatchUpdated({
          contactIds: readyContactIds,
          changes: {
            status: 'delivered',
            processStage: null,
          },
        });
      } catch (error) {
        this.logger.error('Failed to batch update delivery contacts with Drive proof', error);
        for (const contactId of readyContactIds) {
          results.push({
            contactId,
            success: false,
            error: error instanceof Error ? error.message : '알 수 없는 오류',
          });
        }
      }
    }

    this.logger.log(
      `Drive delivery proof batch finish: requested=${dto.contactIds.length}, succeeded=${
        results.filter((result) => result.success).length
      }, failed=${results.filter((result) => !result.success).length}, elapsedMs=${
        Date.now() - startedAt
      }`
    );

    return { results };
  }

  private async uploadDeliveryProofBufferToDrive(
    contact: DeliveryProofContact,
    file: UploadedContactDriveFile,
    actor: TimelineActor,
    deliveredAt: Date
  ): Promise<{ reference: string }> {
    const displayName = this.buildDeliveryProofFileName(
      deliveredAt,
      file.originalname,
      file.mimetype
    );
    const mimeType = this.resolveDeliveryProofMimeType(file.mimetype, displayName);
    const uploadedBy = this.resolveDeliveryProofUploadedBy(actor);
    const folder = (await this.foldersService.ensureInquiryFolder(contact.id)) as
      | DeliveryProofFolder
      | null;

    if (!folder) {
      throw new BadRequestException('문의 폴더를 찾을 수 없습니다.');
    }

    try {
      await this.foldersService.moveInquiryFolderToCompleted(contact.id);
    } catch (error) {
      this.logger.warn(
        `moveInquiryFolderToCompleted failed during Drive delivery proof upload for contactId=${
          contact.id
        }: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (folder.storageProvider !== StorageProvider.GOOGLE_DRIVE || !folder.driveFolderId) {
      throw new BadRequestException('Google Drive 문의 폴더가 준비되지 않았습니다.');
    }

    const driveUpload = await this.storageService.uploadDriveBuffer({
      fileName: displayName,
      mimeType,
      buffer: file.buffer,
      parentStorageFolderId: folder.driveFolderId,
    });

    const created = await this.prisma.webhardFile.create({
      data: {
        name: displayName,
        originalName: file.originalname || displayName,
        size: BigInt(driveUpload.size ?? file.size ?? 0),
        mimeType: driveUpload.mimeType ?? mimeType,
        path: `${folder.id}/${displayName}`,
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFileId: driveUpload.storageFileId,
        driveMimeType: driveUpload.mimeType ?? null,
        folderId: folder.id,
        companyId: folder.companyId,
        uploadedBy,
        inquiryNumber: contact.workNumber ?? contact.inquiryNumber ?? null,
      },
    });

    this.eventsGateway.emitToFolder(folder.id, {
      type: 'file:created',
      folderId: folder.id,
      data: { fileId: created.id, contactId: contact.id },
    });

    return { reference: toDriveReference(driveUpload.storageFileId) };
  }

  /**
   * 일괄 납품 완료 처리
   * 1. findMany로 대상 contacts 일괄 조회 (1회 DB 호출)
   * 2. 메모리에서 유효성 검증 (processStage='delivery', status!='delivered')
   * 3. Prisma.$transaction으로 유효한 건 일괄 update + timeline 기록
   * 4. 트랜잭션 완료 후 Socket.IO 이벤트 일괄 발행
   */
  async batchStartDelivery(dto: BatchStartDeliveryDto) {
    const results: Array<{ contactId: string; success: boolean; error?: string }> = [];

    const actor: TimelineActor = {
      actorType: (dto.actorType as 'admin' | 'company' | 'worker') || 'worker',
      actorName: dto.actorName,
    };

    // Step 1: 일괄 조회 (1회 DB 호출)
    const existingContacts = await this.prisma.executeWithRetry(
      () =>
        this.prisma.contact.findMany({
          where: { id: { in: dto.contactIds } },
          select: {
            id: true,
            processStage: true,
            status: true,
            companyName: true,
            inquiryNumber: true,
            workNumber: true,
          },
        }),
      { operationName: 'contacts.batchStartDelivery.findMany' }
    );

    const existingMap = new Map(existingContacts.map((c) => [c.id, c]));

    // Step 2: 유효성 검증 (메모리에서 처리)
    const validContactIds: string[] = [];
    for (const contactId of dto.contactIds) {
      const existing = existingMap.get(contactId);

      if (!existing) {
        results.push({ contactId, success: false, error: '문의를 찾을 수 없습니다.' });
        continue;
      }

      if (existing.processStage !== 'delivery') {
        results.push({
          contactId,
          success: false,
          error: `공정 단계가 delivery가 아닙니다 (현재: ${existing.processStage}).`,
        });
        continue;
      }

      if (existing.status === 'delivered') {
        results.push({ contactId, success: false, error: '이미 납품완료 상태입니다.' });
        continue;
      }

      validContactIds.push(contactId);
    }

    // Step 3: 유효한 건이 있으면 트랜잭션으로 일괄 처리
    if (validContactIds.length > 0) {
      const now = new Date();
      const updateData: Prisma.ContactUpdateInput = {
        status: 'delivered',
        processStage: null,
        updatedAt: now,
      };
      if (dto.deliveryProofImage) {
        updateData.deliveryProofImage = dto.deliveryProofImage;
      }

      try {
        const txOperations = validContactIds.flatMap((contactId) => {
          const existing = existingMap.get(contactId)!;
          return [
            // Update contact: status='delivered', processStage=null (1단계 즉시 완료)
            this.prisma.contact.update({
              where: { id: contactId },
              data: updateData,
            }),
            // Timeline: status change to delivered
            this.prisma.contactStatusHistory.create({
              data: {
                contactId,
                changeType: 'status_change',
                fromStatus: existing.status,
                toStatus: 'delivered',
                actorType: actor.actorType || 'worker',
                actorName: actor.actorName ?? null,
                companyName: existing.companyName ?? null,
                source: 'manual',
                note: dto.deliveryProofImage ? '납품 완료 (사진 첨부)' : '납품 완료',
                metadata: {},
              },
            }),
            // Timeline: process stage change (delivery → null)
            this.prisma.contactStatusHistory.create({
              data: {
                contactId,
                changeType: 'process_stage_change',
                fromStage: 'delivery',
                toStage: null,
                actorType: actor.actorType || 'worker',
                actorName: actor.actorName ?? null,
                companyName: existing.companyName ?? null,
                source: 'manual',
                note: '납품완료 — 즉시 처리',
                metadata: {},
              },
            }),
          ];
        });

        await this.prisma.executeWithRetry(() => this.prisma.$transaction(txOperations), {
          operationName: 'contacts.batchStartDelivery.transaction',
        });

        await this.syncDeliveryProofToWebhard(
          validContactIds.map((contactId) => {
            const contact = existingMap.get(contactId)!;
            return {
              id: contact.id,
              inquiryNumber: contact.inquiryNumber,
              workNumber: contact.workNumber,
            };
          }),
          dto,
          actor,
          now
        );

        // Step 4: 트랜잭션 완료 후 batch Socket.IO 이벤트 1회 발행
        for (const contactId of validContactIds) {
          results.push({ contactId, success: true });
        }

        this.contactsGateway.emitBatchUpdated({
          contactIds: validContactIds,
          changes: {
            status: 'delivered',
            processStage: null,
            ...(dto.deliveryProofImage ? { deliveryProofImage: dto.deliveryProofImage } : {}),
          },
        });
      } catch (error) {
        this.logger.error('Failed to batch update delivery contacts', error);
        // 트랜잭션 실패 시 모든 유효 건을 실패로 기록
        for (const contactId of validContactIds) {
          results.push({
            contactId,
            success: false,
            error: error instanceof Error ? error.message : '알 수 없는 오류',
          });
        }
      }
    }

    return { results };
  }

  /**
   * 일괄 납품 완료 (delivering → delivered, processStage → null)
   * 2단계 납품 프로세스의 2단계: 납품 시작 후 최종 완료 처리
   */
  async batchCompleteDelivery(dto: BatchCompleteDeliveryDto) {
    const results: Array<{ contactId: string; success: boolean; error?: string }> = [];

    const actor: TimelineActor = {
      actorType: (dto.actorType as 'admin' | 'company' | 'worker') || 'worker',
      actorName: dto.actorName,
    };

    // Step 1: 일괄 조회 (1회 DB 호출)
    const existingContacts = await this.prisma.executeWithRetry(
      () =>
        this.prisma.contact.findMany({
          where: { id: { in: dto.contactIds } },
          select: {
            id: true,
            processStage: true,
            status: true,
            companyName: true,
          },
        }),
      { operationName: 'contacts.batchCompleteDelivery.findMany' }
    );

    const existingMap = new Map(existingContacts.map((c) => [c.id, c]));

    // Step 2: 유효성 검증 (processStage='delivery' AND status='delivering')
    const validContactIds: string[] = [];
    for (const contactId of dto.contactIds) {
      const existing = existingMap.get(contactId);

      if (!existing) {
        results.push({ contactId, success: false, error: '문의를 찾을 수 없습니다.' });
        continue;
      }

      if (existing.processStage !== 'delivery') {
        results.push({
          contactId,
          success: false,
          error: `공정 단계가 delivery가 아닙니다 (현재: ${existing.processStage}).`,
        });
        continue;
      }

      if (existing.status !== 'delivering') {
        results.push({
          contactId,
          success: false,
          error: `상태가 delivering이 아닙니다 (현재: ${existing.status}).`,
        });
        continue;
      }

      validContactIds.push(contactId);
    }

    // Step 3: 유효한 건이 있으면 트랜잭션으로 일괄 처리
    if (validContactIds.length > 0) {
      const now = new Date();
      const updateData: Prisma.ContactUpdateInput = {
        status: 'delivered',
        processStage: null,
        updatedAt: now,
      };
      if (dto.deliveryCompleteImage) {
        updateData.deliveryCompleteImage = dto.deliveryCompleteImage;
      }

      try {
        const txOperations = validContactIds.flatMap((contactId) => {
          const existing = existingMap.get(contactId)!;
          return [
            // Update contact: status='delivered', processStage=null
            this.prisma.contact.update({
              where: { id: contactId },
              data: updateData,
            }),
            // Timeline: status change (delivering → delivered)
            this.prisma.contactStatusHistory.create({
              data: {
                contactId,
                changeType: 'status_change',
                fromStatus: 'delivering',
                toStatus: 'delivered',
                actorType: actor.actorType || 'worker',
                actorName: actor.actorName ?? null,
                companyName: existing.companyName ?? null,
                source: 'manual',
                note: dto.deliveryCompleteImage ? '납품 완료 (완료 사진 첨부)' : '납품 완료',
                metadata: {},
              },
            }),
            // Timeline: processStage change (delivery → null)
            this.prisma.contactStatusHistory.create({
              data: {
                contactId,
                changeType: 'process_stage_change',
                fromStage: 'delivery',
                toStage: null,
                actorType: actor.actorType || 'worker',
                actorName: actor.actorName ?? null,
                companyName: existing.companyName ?? null,
                source: 'manual',
                note: '납품 완료 처리',
                metadata: {},
              },
            }),
          ];
        });

        await this.prisma.executeWithRetry(() => this.prisma.$transaction(txOperations), {
          operationName: 'contacts.batchCompleteDelivery.transaction',
        });

        // Step 4: 트랜잭션 완료 후 batch Socket.IO 이벤트 1회 발행
        for (const contactId of validContactIds) {
          results.push({ contactId, success: true });
        }

        this.contactsGateway.emitBatchUpdated({
          contactIds: validContactIds,
          changes: { status: 'delivered', processStage: null },
        });
      } catch (error) {
        this.logger.error('Failed to batch complete delivery contacts', error);
        // 트랜잭션 실패 시 모든 유효 건을 실패로 기록
        for (const contactId of validContactIds) {
          results.push({
            contactId,
            success: false,
            error: error instanceof Error ? error.message : '알 수 없는 오류',
          });
        }
      }
    }

    return { results };
  }

  /**
   * Contact의 도면 관련 필드 직접 업데이트 (drawingFileUrl, processStage 등)
   */
  async updateContactDrawingFields(
    contactId: string,
    data: {
      drawingFileUrl?: string | null;
      drawingFileName?: string | null;
      processStage?: string;
      confirmedAt?: Date;
    }
  ) {
    return this.prisma.contact.update({
      where: { id: contactId },
      data: { ...data, updatedAt: new Date() },
    });
  }

  /**
   * WebhardFile 조회 — 존재 + 미삭제 확인
   */
  async findWebhardFileOrFail(fileId: string) {
    const file = await this.prisma.webhardFile.findFirst({
      where: { id: fileId, deletedAt: null },
    });
    if (!file) {
      throw new NotFoundException('웹하드 파일을 찾을 수 없습니다.');
    }
    return file;
  }

  /**
   * WebhardFile.inquiryNumber 업데이트 (문의 연결 표시)
   */
  async updateWebhardFileInquiryNumber(fileId: string, inquiryNumber: string | null | undefined) {
    await this.prisma.webhardFile.update({
      where: { id: fileId },
      data: { inquiryNumber: inquiryNumber ?? null },
    });
  }

  /**
   * companyId(세션)로 업체명 조회
   */
  async getCompanyNameByCompanyId(companyId: number): Promise<string> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { companyName: true },
    });
    if (!company) {
      throw new NotFoundException('업체 정보를 찾을 수 없습니다.');
    }
    return company.companyName;
  }

  /**
   * 문의가 해당 업체 소유인지 검증
   */
  async verifyCompanyOwnership(contactId: string, companyName: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, status: { not: 'deleting' } },
    });
    if (!contact) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }
    if (contact.companyName !== companyName) {
      throw new ForbiddenException('해당 문의에 대한 접근 권한이 없습니다.');
    }
    return contact;
  }

  /**
   * sourceId 문의의 도면을 targetId 문의로 복사하고, sourceId를 soft delete
   */
  async mergeDrawingsFromSource(
    targetId: string,
    sourceId: string
  ): Promise<{ mergedRevisionCount: number; sourceDeleted: boolean }> {
    // 1. 양쪽 Contact 존재 확인
    const [target, source] = await Promise.all([
      this.prisma.contact.findFirst({ where: { id: targetId, status: { not: 'deleting' } } }),
      this.prisma.contact.findFirst({ where: { id: sourceId, status: { not: 'deleting' } } }),
    ]);
    if (!target) throw new NotFoundException('대상 문의를 찾을 수 없습니다.');
    if (!source) throw new NotFoundException('원본 문의를 찾을 수 없습니다.');

    // sourceId에 자식 Contact이 있으면 에러 (분할된 문의는 연결 대상이 아님)
    const childCount = await this.prisma.contact.count({
      where: { parentContactId: sourceId, deletedAt: null },
    });
    if (childCount > 0) {
      throw new BadRequestException('분할된 문의는 연결 대상이 아닙니다.');
    }

    let mergedCount = 0;

    // 2. sourceId의 drawingFileUrl이 있으면 → targetId에 DrawingRevision 생성 + drawingFileUrl 업데이트
    if (source.drawingFileUrl) {
      await this.drawingRevisionService.createRevision(
        targetId,
        {
          reason: 'field_correction',
          files: [
            {
              url: source.drawingFileUrl,
              name: source.drawingFileName ?? 'merged-drawing',
            },
          ],
          note: `문의 ${source.inquiryNumber ?? sourceId}에서 연결`,
          source: 'manual',
        },
        { actorType: 'admin' }
      );

      await this.prisma.contact.update({
        where: { id: targetId },
        data: {
          drawingFileUrl: source.drawingFileUrl,
          drawingFileName: source.drawingFileName,
          updatedAt: new Date(),
        },
      });

      mergedCount++;
    }

    // 3. sourceId의 DrawingRevision들 → targetId로 복사
    const sourceRevisions = await this.prisma.drawingRevision.findMany({
      where: { contactId: sourceId },
      orderBy: { createdAt: 'asc' },
    });

    for (const rev of sourceRevisions) {
      const files = rev.files as unknown as Array<{
        url: string;
        name: string;
        size?: number;
        mimeType?: string;
      }>;

      await this.drawingRevisionService.createRevision(
        targetId,
        {
          reason: rev.reason,
          reasonDetail: rev.reasonDetail ?? undefined,
          files,
          processStage: rev.processStage ?? undefined,
          note: rev.note ?? undefined,
          isPublic: rev.isPublic,
          source: rev.source,
        },
        {
          actorType: rev.actorType,
          actorName: rev.actorName ?? undefined,
        }
      );

      mergedCount++;
    }

    // 4. sourceId soft delete
    await this.prisma.contact.update({
      where: { id: sourceId },
      data: {
        status: 'deleting',
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // 5. 타임라인 기록 (양쪽 모두, fire-and-forget)
    await this.timelineService
      .recordChange({
        contactId: targetId,
        changeType: 'drawing_revision',
        actorType: 'admin',
        source: 'manual',
        note: `문의 ${source.inquiryNumber ?? sourceId}에서 도면 ${mergedCount}건 연결됨`,
        metadata: { sourceContactId: sourceId, mergedCount },
      })
      .catch((err) => {
        this.logger.error(
          `Timeline record failed (target): ${err instanceof Error ? err.message : String(err)}`
        );
      });

    await this.timelineService
      .recordChange({
        contactId: sourceId,
        changeType: 'deleted',
        actorType: 'admin',
        source: 'manual',
        note: `문의 ${target.inquiryNumber ?? targetId}로 도면 연결 후 삭제됨`,
        metadata: { targetContactId: targetId },
      })
      .catch((err) => {
        this.logger.error(
          `Timeline record failed (source): ${err instanceof Error ? err.message : String(err)}`
        );
      });

    this.contactsGateway.emitContactDeleted(sourceId);

    return { mergedRevisionCount: mergedCount, sourceDeleted: true };
  }
}
