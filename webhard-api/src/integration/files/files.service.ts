import { Injectable, Logger } from '@nestjs/common';
import { SessionUser } from '../../auth/auth.service';
import {
  formatLogEvent,
  generateCorrelationId,
  hashIdentifier,
  type BackendLogStatus,
} from '../../common/logging/log-event';
import { ConfirmUploadDto } from '../../files/dto/file.dto';
import { FilesService } from '../../files/files.service';
import { FileRegisterDto } from './dto/file-register.dto';

export interface FileRegisterResponseDto {
  file_id: string;
  order_id: string | null;
  duplicate: boolean;
  status: 'FILE_RECEIVED';
}

const FILE_REGISTER_SYSTEM_USER: SessionUser = {
  userType: 'admin',
  userId: 'integration:file-register',
  companyId: null,
};

@Injectable()
export class IntegrationFilesService {
  private readonly logger = new Logger(IntegrationFilesService.name);

  constructor(private readonly filesService: FilesService) {}

  async registerFile(dto: FileRegisterDto): Promise<FileRegisterResponseDto> {
    const startedAt = Date.now();
    const correlationId = generateCorrelationId('file-register');
    this.logger.log(this.formatRegisterLog('start', dto, correlationId));

    try {
      const existingFile = await this.filesService.findExistingUploadMetadata({
        driveFileId: dto.drive_file_id,
        path: dto.path,
      });
      if (existingFile) {
        this.logger.log(
          this.formatRegisterLog('success', dto, correlationId, {
            duplicate: true,
            fileId: existingFile.id,
            elapsedMs: Date.now() - startedAt,
          })
        );
        return {
          file_id: existingFile.id,
          order_id: dto.order_id ?? null,
          duplicate: true,
          status: 'FILE_RECEIVED',
        };
      }

      const file = await this.filesService.confirmUpload(
        this.toConfirmUploadDto(dto),
        FILE_REGISTER_SYSTEM_USER
      );

      this.logger.log(
        this.formatRegisterLog('success', dto, correlationId, {
          duplicate: false,
          fileId: file.id,
          elapsedMs: Date.now() - startedAt,
        })
      );

      return {
        file_id: file.id,
        order_id: dto.order_id ?? null,
        duplicate: false,
        status: 'FILE_RECEIVED',
      };
    } catch (error) {
      this.logger.error(
        this.formatRegisterLog('failure', dto, correlationId, {
          elapsedMs: Date.now() - startedAt,
          errorType: this.getErrorType(error),
        })
      );
      throw error;
    }
  }

  private toConfirmUploadDto(dto: FileRegisterDto): ConfirmUploadDto {
    const confirmDto: ConfirmUploadDto = {
      key: dto.path,
      name: dto.original_name_safe,
      originalName: dto.original_name_safe,
      size: dto.size_bytes,
      mimeType: dto.mime_type,
      storageProvider: 'google_drive',
    };

    if (dto.folder_id) {
      confirmDto.folderId = dto.folder_id;
    }
    if (dto.company_id) {
      confirmDto.companyId = dto.company_id;
    }
    if (dto.drive_file_id) {
      confirmDto.driveFileId = dto.drive_file_id;
    }

    return confirmDto;
  }

  private formatRegisterLog(
    status: Extract<BackendLogStatus, 'start' | 'success' | 'failure'>,
    dto: FileRegisterDto,
    correlationId: string,
    details: {
      duplicate?: boolean;
      fileId?: string;
      elapsedMs?: number;
      errorType?: string;
    } = {}
  ): string {
    return formatLogEvent({
      level: status === 'failure' ? 'error' : 'info',
      project: 'company_site',
      component: IntegrationFilesService.name,
      feature: 'file_register',
      event: 'integration_file_register',
      action: 'register',
      status,
      channel: 'external',
      correlation_id: correlationId,
      duration_ms: details.elapsedMs,
      count: 1,
      actor_type: 'integration_worker',
      actor_id_hash: hashIdentifier(dto.source_worker),
      target_type: 'webhard_file',
      target_id_hash: details.fileId
        ? hashIdentifier(details.fileId)
        : hashIdentifier(dto.drive_file_id || dto.path),
      error_type: details.errorType,
      metadata: {
        sourceWorker: dto.source_worker,
        storageProvider: dto.storage_provider,
        fileKind: dto.file_kind,
        companyId: dto.company_id,
        hasFolderId: Boolean(dto.folder_id),
        hasDriveFileId: Boolean(dto.drive_file_id),
        orderIdHash: dto.order_id ? hashIdentifier(dto.order_id) : undefined,
        folderIdHash: dto.folder_id ? hashIdentifier(dto.folder_id) : undefined,
        duplicate: details.duplicate,
        sizeBytes: dto.size_bytes,
      },
    });
  }

  private getErrorType(error: unknown): string {
    return error instanceof Error ? error.name : typeof error;
  }
}
