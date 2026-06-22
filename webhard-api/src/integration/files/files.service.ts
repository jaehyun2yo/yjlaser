import { Injectable, Logger } from '@nestjs/common';
import { SessionUser } from '../../auth/auth.service';
import { ConfirmUploadDto } from '../../files/dto/file.dto';
import { FilesService } from '../../files/files.service';
import { FileRegisterDto, type FileRegisterStorageProvider } from './dto/file-register.dto';

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

const FILE_REGISTER_PROVIDER_TO_CONFIRM_PROVIDER: Record<
  FileRegisterStorageProvider,
  ConfirmUploadDto['storageProvider']
> = {
  google_drive: 'google_drive',
  r2_legacy: 'r2',
  local_test: 'r2',
};

@Injectable()
export class IntegrationFilesService {
  private readonly logger = new Logger(IntegrationFilesService.name);

  constructor(private readonly filesService: FilesService) {}

  async registerFile(dto: FileRegisterDto): Promise<FileRegisterResponseDto> {
    const startedAt = Date.now();
    this.logger.log(this.formatRegisterLog('start', dto));

    try {
      const existingFile = await this.filesService.findExistingUploadMetadata({
        driveFileId: dto.drive_file_id,
        path: dto.path,
      });
      if (existingFile) {
        this.logger.log(
          this.formatRegisterLog('success', dto, {
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
        this.formatRegisterLog('success', dto, {
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
        this.formatRegisterLog('failure', dto, {
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
      storageProvider: this.toConfirmStorageProvider(dto.storage_provider),
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

  private toConfirmStorageProvider(
    provider: FileRegisterStorageProvider
  ): ConfirmUploadDto['storageProvider'] {
    return FILE_REGISTER_PROVIDER_TO_CONFIRM_PROVIDER[provider];
  }

  private formatRegisterLog(
    status: 'start' | 'success' | 'failure',
    dto: FileRegisterDto,
    details: {
      duplicate?: boolean;
      fileId?: string;
      elapsedMs?: number;
      errorType?: string;
    } = {}
  ): string {
    const parts = [
      'integration file register',
      `status=${status}`,
      `sourceWorker=${dto.source_worker}`,
      `provider=${dto.storage_provider}`,
      'count=1',
    ];

    if (typeof details.duplicate === 'boolean') {
      parts.push(`duplicate=${details.duplicate}`);
    }
    if (details.fileId) {
      parts.push(`fileId=${details.fileId}`);
    }
    if (typeof details.elapsedMs === 'number') {
      parts.push(`elapsedMs=${details.elapsedMs}`);
    }
    if (details.errorType) {
      parts.push(`errorType=${details.errorType}`);
    }

    return parts.join(' ');
  }

  private getErrorType(error: unknown): string {
    return error instanceof Error ? error.name : typeof error;
  }
}
