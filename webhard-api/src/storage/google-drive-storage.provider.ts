import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider } from '@prisma/client';
import { drive_v3, google } from 'googleapis';
import { GoogleAuth, JWTInput } from 'google-auth-library';
import * as crypto from 'crypto';
import { Readable } from 'stream';
import {
  BatchMoveFileInput,
  BatchStorageFileOperationResult,
  BatchTrashFileInput,
  ConfirmUploadedFileInput,
  CreateFolderInput,
  CreateUploadSessionInput,
  DeleteFileInput,
  DeleteFolderInput,
  DownloadFileInput,
  DownloadFileResult,
  MoveFileInput,
  MoveFolderInput,
  RenameFileInput,
  RenameFolderInput,
  RestoreFileInput,
  StorageFileMetadata,
  StorageProviderClient,
  TrashFileInput,
  UploadBufferInput,
  UploadBufferResult,
  UploadSessionResult,
} from './storage-provider.interface';

const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const DRIVE_UPLOAD_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DRIVE_BATCH_URL = 'https://www.googleapis.com/batch/drive/v3';

type DriveBatchRequest = {
  storageFileId: string;
  requestLine: string;
  body: Record<string, unknown>;
};

type DriveRetryOptions = {
  retryForbidden?: boolean;
  mapBoundaryUnavailable?: boolean;
};

@Injectable()
export class GoogleDriveStorageProvider implements StorageProviderClient {
  readonly provider = StorageProvider.GOOGLE_DRIVE;
  private readonly logger = new Logger(GoogleDriveStorageProvider.name);
  private drive: drive_v3.Drive | null = null;
  private auth: GoogleAuth | null = null;
  private sharedDriveId: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  private ensureDrive(): { drive: drive_v3.Drive; auth: GoogleAuth; sharedDriveId: string } {
    if (this.drive && this.auth && this.sharedDriveId) {
      return { drive: this.drive, auth: this.auth, sharedDriveId: this.sharedDriveId };
    }

    const rawCredentials = this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON');
    const sharedDriveId = this.configService.get<string>('GOOGLE_DRIVE_SHARED_DRIVE_ID');

    if (!rawCredentials || !sharedDriveId) {
      this.logger.warn('Google Drive boundary failed: context=config, status=missing');
      throw new ServiceUnavailableException('Google Drive storage is temporarily unavailable');
    }

    this.sharedDriveId = sharedDriveId;
    let credentials: JWTInput;
    try {
      credentials = JSON.parse(rawCredentials) as unknown as JWTInput;
    } catch {
      this.logger.warn('Google Drive boundary failed: context=config, status=invalid_json');
      throw new ServiceUnavailableException('Google Drive storage is temporarily unavailable');
    }
    this.auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [DRIVE_SCOPE],
    });
    this.drive = google.drive({ version: 'v3', auth: this.auth });
    return { drive: this.drive, auth: this.auth, sharedDriveId: this.sharedDriveId };
  }

  async generateIds(count: number): Promise<string[]> {
    const { drive } = this.ensureDrive();
    const result = await this.withRetry(() =>
      drive.files.generateIds({
        count,
        space: 'drive',
      })
    );
    const ids = result.data.ids ?? [];
    if (ids.length !== count) {
      throw new InternalServerErrorException('Drive id generation failed');
    }
    return ids;
  }

  async createFolder(input: CreateFolderInput): Promise<{ storageFolderId: string }> {
    const { drive, sharedDriveId } = this.ensureDrive();
    const storageFolderId = input.storageFolderId ?? (await this.generateIds(1))[0];

    try {
      const result = await this.withRetry(() =>
        drive.files.create({
          requestBody: {
            id: storageFolderId,
            name: input.name,
            mimeType: DRIVE_FOLDER_MIME,
            parents: [input.parentStorageFolderId ?? sharedDriveId],
          },
          fields: 'id',
          supportsAllDrives: true,
        })
      );

      const id = result.data.id;
      if (!id) throw new InternalServerErrorException('Drive folder create returned no id');
      return { storageFolderId: id };
    } catch (error) {
      if (this.getStatus(error) === 409) {
        await this.getFileMetadataById(storageFolderId);
        return { storageFolderId };
      }
      throw error;
    }
  }

  async renameFolder(input: RenameFolderInput): Promise<void> {
    const { drive } = this.ensureDrive();
    await this.withRetry(() =>
      drive.files.update({
        fileId: input.storageFolderId,
        requestBody: { name: input.name },
        fields: 'id',
        supportsAllDrives: true,
      })
    );
  }

  async moveFolder(input: MoveFolderInput): Promise<void> {
    await this.moveDriveItem(input.storageFolderId, input.parentStorageFolderId);
  }

  async deleteFolder(input: DeleteFolderInput): Promise<void> {
    const { drive } = this.ensureDrive();
    await this.withRetry(() =>
      drive.files.update({
        fileId: input.storageFolderId,
        requestBody: { trashed: true },
        fields: 'id,trashed',
        supportsAllDrives: true,
      })
    );
  }

  async createUploadSession(input: CreateUploadSessionInput): Promise<UploadSessionResult> {
    const { auth } = this.ensureDrive();
    const storageFileId = input.storageFileId ?? (await this.generateIds(1))[0];
    const client = await this.getAuthenticatedClient(auth, 'upload_session_auth');
    const url = new URL('https://www.googleapis.com/upload/drive/v3/files');
    url.searchParams.set('uploadType', 'resumable');
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('fields', 'id,name,mimeType,size,parents');
    const authHeaders = await this.getAuthenticatedHeaders(
      client,
      url.toString(),
      'upload_session_headers'
    );

    const response = await this.fetchDriveBoundary(
      url.toString(),
      {
        method: 'POST',
        headers: {
          ...this.toPlainHeaders(authHeaders),
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': input.mimeType,
          'X-Upload-Content-Length': String(input.size),
        },
        body: JSON.stringify({
          id: storageFileId,
          name: input.fileName,
          mimeType: input.mimeType,
          parents: [input.parentStorageFolderId],
        }),
      },
      'upload_session_fetch'
    );

    if (!response.ok) {
      this.logger.warn(`Drive upload setup failed: status=${response.status}`);
      throw new InternalServerErrorException('Failed to create Drive upload session');
    }

    const uploadUrl = response.headers.get('location');
    if (!uploadUrl) {
      throw new InternalServerErrorException('Drive upload session returned no location');
    }

    return {
      provider: StorageProvider.GOOGLE_DRIVE,
      storageFileId,
      uploadUrl,
      expiresAt: new Date(Date.now() + DRIVE_UPLOAD_SESSION_TTL_MS),
      headers: { 'Content-Type': input.mimeType },
    };
  }

  async confirmUploadedFile(input: ConfirmUploadedFileInput): Promise<StorageFileMetadata> {
    const metadata = await this.getFileMetadataById(input.storageFileId);
    if (!metadata.parentStorageFolderIds.includes(input.expectedParentStorageFolderId)) {
      throw new InternalServerErrorException('Drive file parent mismatch');
    }
    return metadata;
  }

  async getItemMetadata(storageFileId: string): Promise<StorageFileMetadata> {
    return this.getFileMetadataById(storageFileId);
  }

  async uploadBuffer(input: UploadBufferInput): Promise<UploadBufferResult> {
    const { drive } = this.ensureDrive();
    const storageFileId = input.storageFileId ?? (await this.generateIds(1))[0];
    const result = await this.withRetry(() =>
      drive.files.create({
        requestBody: {
          id: storageFileId,
          name: input.fileName,
          mimeType: input.mimeType,
          parents: [input.parentStorageFolderId],
        },
        media: {
          mimeType: input.mimeType,
          body: Readable.from(input.buffer),
        },
        fields: 'id,name,mimeType,size,parents',
        supportsAllDrives: true,
      })
    );

    return this.toMetadata(result.data);
  }

  async downloadFile(input: DownloadFileInput): Promise<DownloadFileResult> {
    const { drive } = this.ensureDrive();
    const metadata = await this.getFileMetadataById(input.storageFileId);
    const result = await this.withRetry(() =>
      drive.files.get(
        { fileId: input.storageFileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' }
      )
    );
    return {
      stream: result.data as unknown as Readable,
      mimeType: metadata.mimeType,
      size: metadata.size,
    };
  }

  async renameFile(input: RenameFileInput): Promise<void> {
    const { drive } = this.ensureDrive();
    await this.withRetry(() =>
      drive.files.update({
        fileId: input.storageFileId,
        requestBody: { name: input.name },
        fields: 'id',
        supportsAllDrives: true,
      })
    );
  }

  async moveFile(input: MoveFileInput): Promise<void> {
    await this.moveDriveItem(
      input.storageFileId,
      input.toParentStorageFolderId,
      input.fromParentStorageFolderId
    );
  }

  async moveFiles(inputs: BatchMoveFileInput[]): Promise<BatchStorageFileOperationResult[]> {
    if (inputs.length === 0) return [];
    if (inputs.length === 1) {
      return this.runSingleBatchCompatibleOperation(inputs[0].storageFileId, () =>
        this.moveFile(inputs[0])
      );
    }
    if (inputs.some((input) => !input.fromParentStorageFolderId)) {
      return Promise.all(
        inputs.map((input) =>
          this.runSingleBatchCompatibleOperation(input.storageFileId, () => this.moveFile(input))
        )
      ).then((results) => results.flat());
    }

    const { sharedDriveId } = this.ensureDrive();
    return this.executeDriveBatch(
      inputs.map((input) => {
        const targetParentId = input.toParentStorageFolderId ?? sharedDriveId;
        const params = new URLSearchParams({
          addParents: targetParentId,
          supportsAllDrives: 'true',
          fields: 'id,parents',
        });
        if (input.fromParentStorageFolderId) {
          params.set('removeParents', input.fromParentStorageFolderId);
        }

        return {
          storageFileId: input.storageFileId,
          requestLine: `PATCH /drive/v3/files/${encodeURIComponent(input.storageFileId)}?${params.toString()} HTTP/1.1`,
          body: {},
        };
      })
    );
  }

  async trashFile(input: TrashFileInput): Promise<void> {
    const { drive } = this.ensureDrive();
    await this.withRetry(() =>
      drive.files.update({
        fileId: input.storageFileId,
        requestBody: { trashed: true },
        fields: 'id,trashed',
        supportsAllDrives: true,
      })
    );
  }

  async trashFiles(inputs: BatchTrashFileInput[]): Promise<BatchStorageFileOperationResult[]> {
    if (inputs.length === 0) return [];
    if (inputs.length === 1) {
      return this.runSingleBatchCompatibleOperation(inputs[0].storageFileId, () =>
        this.trashFile(inputs[0])
      );
    }

    return this.executeDriveBatch(
      inputs.map((input) => {
        const params = new URLSearchParams({
          supportsAllDrives: 'true',
          fields: 'id,trashed',
        });

        return {
          storageFileId: input.storageFileId,
          requestLine: `PATCH /drive/v3/files/${encodeURIComponent(input.storageFileId)}?${params.toString()} HTTP/1.1`,
          body: { trashed: true },
        };
      })
    );
  }

  async restoreFile(input: RestoreFileInput): Promise<void> {
    const { drive } = this.ensureDrive();
    await this.withRetry(() =>
      drive.files.update({
        fileId: input.storageFileId,
        requestBody: { trashed: false },
        fields: 'id,trashed',
        supportsAllDrives: true,
      })
    );
  }

  async deleteFile(input: DeleteFileInput): Promise<void> {
    const fileHash = this.hashForLog(input.storageFileId);
    if (input.permanentDeleteApproved !== true) {
      this.logger.warn(
        `Google Drive permanent delete blocked: reason=missing_approval, fileHash=${fileHash}`
      );
      throw new BadRequestException('Google Drive permanent delete requires explicit approval');
    }

    const { drive } = this.ensureDrive();
    try {
      const metadata = await this.withRetry(
        () =>
          drive.files.get({
            fileId: input.storageFileId,
            fields: 'id,trashed',
            supportsAllDrives: true,
          }),
        1,
        { retryForbidden: false, mapBoundaryUnavailable: false }
      );

      if (metadata.data.trashed !== true) {
        this.logger.warn(
          `Google Drive permanent delete blocked: reason=not_trashed, fileHash=${fileHash}`
        );
        throw new BadRequestException(
          'Google Drive permanent delete is allowed only for trashed files'
        );
      }

      await this.withRetry(
        () =>
          drive.files.delete({
            fileId: input.storageFileId,
            supportsAllDrives: true,
          }),
        1,
        { retryForbidden: false, mapBoundaryUnavailable: false }
      );
      this.logger.log(`Google Drive permanent delete completed: fileHash=${fileHash}`);
    } catch (error) {
      const status = this.getStatus(error);
      const errorType = error instanceof Error ? error.constructor.name : typeof error;
      this.logger.warn(
        `Google Drive permanent delete failed: fileHash=${fileHash}, status=${
          status ?? 'unknown'
        }, errorType=${errorType}`
      );
      throw error;
    }
  }

  private async moveDriveItem(
    fileId: string,
    newParentId: string | null,
    oldParentId?: string | null
  ): Promise<void> {
    const { drive, sharedDriveId } = this.ensureDrive();
    const currentParent =
      oldParentId ?? (await this.getFileMetadataById(fileId)).parentStorageFolderIds[0] ?? null;
    const targetParentId = newParentId ?? sharedDriveId;

    await this.withRetry(() =>
      drive.files.update({
        fileId,
        addParents: targetParentId,
        ...(currentParent ? { removeParents: currentParent } : {}),
        fields: 'id,parents',
        supportsAllDrives: true,
      })
    );
  }

  private async getFileMetadataById(fileId: string): Promise<StorageFileMetadata> {
    const { drive } = this.ensureDrive();
    const result = await this.withRetry(() =>
      drive.files.get({
        fileId,
        fields: 'id,name,mimeType,size,parents',
        supportsAllDrives: true,
      })
    );
    return this.toMetadata(result.data);
  }

  private toMetadata(file: drive_v3.Schema$File): StorageFileMetadata {
    if (!file.id || !file.name || !file.mimeType) {
      throw new InternalServerErrorException('Drive metadata is incomplete');
    }
    return {
      provider: StorageProvider.GOOGLE_DRIVE,
      storageFileId: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: Number(file.size ?? 0),
      parentStorageFolderIds: file.parents ?? [],
    };
  }

  private async runSingleBatchCompatibleOperation(
    storageFileId: string,
    operation: () => Promise<void>
  ): Promise<BatchStorageFileOperationResult[]> {
    try {
      await operation();
      return [{ storageFileId, success: true }];
    } catch (error) {
      return [
        {
          storageFileId,
          success: false,
          status: this.getStatus(error) ?? undefined,
          error: error instanceof Error ? error.message : String(error),
        },
      ];
    }
  }

  private async executeDriveBatch(
    requests: DriveBatchRequest[]
  ): Promise<BatchStorageFileOperationResult[]> {
    const { auth } = this.ensureDrive();
    const boundary = `batch_${crypto.randomUUID().replace(/-/g, '')}`;
    const client = await this.getAuthenticatedClient(auth, 'batch_auth');
    const authHeaders = await this.getAuthenticatedHeaders(
      client,
      DRIVE_BATCH_URL,
      'batch_headers'
    );
    const body = this.buildBatchRequestBody(boundary, requests);

    const response = await this.fetchDriveBoundary(
      DRIVE_BATCH_URL,
      {
        method: 'POST',
        headers: {
          ...this.toPlainHeaders(authHeaders),
          'Content-Type': `multipart/mixed; boundary=${boundary}`,
        },
        body,
        cache: 'no-store',
      },
      'batch_fetch'
    );

    const responseText = await response.text();
    if (!response.ok) {
      this.logger.warn(`Drive batch request failed: status=${response.status}`);
      throw new InternalServerErrorException('Drive batch request failed');
    }

    return this.parseBatchResponse(
      response.headers.get('content-type') ?? '',
      responseText,
      requests
    );
  }

  private buildBatchRequestBody(boundary: string, requests: DriveBatchRequest[]): string {
    const parts = requests.map((request, index) =>
      [
        `--${boundary}`,
        'Content-Type: application/http',
        `Content-ID: <item-${index}>`,
        '',
        request.requestLine,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(request.body),
      ].join('\r\n')
    );

    return `${parts.join('\r\n')}\r\n--${boundary}--`;
  }

  private parseBatchResponse(
    contentType: string,
    responseText: string,
    requests: DriveBatchRequest[]
  ): BatchStorageFileOperationResult[] {
    const boundary = this.extractMultipartBoundary(contentType);
    const responseParts = boundary
      ? responseText
          .split(`--${boundary}`)
          .map((part) => part.trim())
          .filter((part) => part && part !== '--')
      : [];

    return requests.map((request, index) => {
      const part = responseParts[index] ?? '';
      const statusMatch = part.match(/HTTP\/\d(?:\.\d)?\s+(\d{3})/);
      const status = statusMatch ? Number(statusMatch[1]) : undefined;
      const success = status !== undefined && status >= 200 && status < 300;
      return {
        storageFileId: request.storageFileId,
        success,
        ...(status ? { status } : {}),
        ...(success ? {} : { error: this.extractBatchError(part) }),
      };
    });
  }

  private extractMultipartBoundary(contentType: string): string | null {
    const match = contentType.match(/boundary="?([^";]+)"?/i);
    return match?.[1] ?? null;
  }

  private extractBatchError(part: string): string {
    const jsonStart = part.indexOf('{');
    if (jsonStart >= 0) {
      try {
        const parsed = JSON.parse(part.slice(jsonStart)) as {
          error?: { message?: unknown };
        };
        const message = parsed.error?.message;
        if (typeof message === 'string' && message.length > 0) {
          return message;
        }
      } catch {
        // Fall through to generic message.
      }
    }

    return 'Drive batch item failed';
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    attempt = 1,
    options: DriveRetryOptions = {}
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      const status = this.getStatus(error);
      const retryForbidden = options.retryForbidden ?? true;
      const mapBoundaryUnavailable = options.mapBoundaryUnavailable ?? true;
      if ((status === 429 || (status === 403 && retryForbidden)) && attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
        return this.withRetry(operation, attempt + 1, options);
      }
      if (mapBoundaryUnavailable && this.isDriveBoundaryUnavailable(error, status)) {
        throw this.toDriveUnavailableException(error, 'drive_api');
      }
      throw error;
    }
  }

  private async getAuthenticatedClient(auth: GoogleAuth, context: string) {
    try {
      return await auth.getClient();
    } catch (error) {
      throw this.toDriveUnavailableException(error, context);
    }
  }

  private async getAuthenticatedHeaders(
    client: Awaited<ReturnType<GoogleAuth['getClient']>>,
    url: string,
    context: string
  ): Promise<Headers> {
    try {
      return await client.getRequestHeaders(url);
    } catch (error) {
      throw this.toDriveUnavailableException(error, context);
    }
  }

  private async fetchDriveBoundary(
    url: string,
    init: RequestInit,
    context: string
  ): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      throw this.toDriveUnavailableException(error, context);
    }
  }

  private isDriveBoundaryUnavailable(error: unknown, status: number | null): boolean {
    if (status === 401 || status === 403 || status === 429) {
      return true;
    }
    const message = error instanceof Error ? error.message : '';
    return /Gaxios|invalid_grant|invalid_client|default credentials|keyFile/i.test(message);
  }

  private toDriveUnavailableException(
    error: unknown,
    context: string
  ): ServiceUnavailableException {
    const status = this.getStatus(error);
    const errorType = error instanceof Error ? error.constructor.name : typeof error;
    this.logger.warn(
      `Google Drive boundary failed: context=${context}, status=${status ?? 'unknown'}, errorType=${errorType}`
    );
    return new ServiceUnavailableException('Google Drive storage is temporarily unavailable');
  }

  private getStatus(error: unknown): number | null {
    if (typeof error !== 'object' || error === null) return null;
    const candidate = error as {
      code?: unknown;
      response?: { status?: unknown };
    };
    const status = Number(candidate.code ?? candidate.response?.status);
    return Number.isFinite(status) ? status : null;
  }

  private toPlainHeaders(headers: Headers): Record<string, string> {
    const plain: Record<string, string> = {};
    headers.forEach((value, key) => {
      plain[key] = value;
    });
    return plain;
  }

  private hashForLog(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
  }
}
