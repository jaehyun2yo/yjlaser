import { Injectable } from '@nestjs/common';
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

@Injectable()
export class IntegrationFilesService {
  constructor(private readonly filesService: FilesService) {}

  async registerFile(dto: FileRegisterDto): Promise<FileRegisterResponseDto> {
    const file = await this.filesService.confirmUpload(
      this.toConfirmUploadDto(dto),
      FILE_REGISTER_SYSTEM_USER
    );

    return {
      file_id: file.id,
      order_id: dto.order_id ?? null,
      duplicate: false,
      status: 'FILE_RECEIVED',
    };
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
    return provider === 'google_drive' ? 'google_drive' : 'r2';
  }
}
