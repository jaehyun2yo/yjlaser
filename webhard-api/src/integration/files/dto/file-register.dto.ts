import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  INTEGRATION_WORKER_TYPES,
  type IntegrationWorkerType,
} from '../../auth/integration-permissions';

export const FILE_REGISTER_STORAGE_PROVIDERS = ['google_drive'] as const;
export type FileRegisterStorageProvider = (typeof FILE_REGISTER_STORAGE_PROVIDERS)[number];

export class FileRegisterDto {
  @IsString()
  @MaxLength(255)
  idempotency_key: string;

  @IsIn(INTEGRATION_WORKER_TYPES)
  source_worker: IntegrationWorkerType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  order_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  company_id?: number;

  @ValidateIf((dto: FileRegisterDto) => dto.storage_provider === 'google_drive')
  @IsUUID()
  folder_id?: string;

  @IsIn(FILE_REGISTER_STORAGE_PROVIDERS)
  storage_provider: FileRegisterStorageProvider;

  @ValidateIf((dto: FileRegisterDto) => dto.storage_provider === 'google_drive')
  @IsString()
  @MaxLength(255)
  drive_file_id?: string;

  @IsString()
  @MaxLength(50)
  file_kind: string;

  @IsString()
  @MaxLength(1000)
  path: string;

  @IsString()
  @MaxLength(500)
  original_name_safe: string;

  @IsString()
  @MaxLength(200)
  mime_type: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  size_bytes: number;

  @ValidateIf((dto: FileRegisterDto) => dto.content_hash !== null)
  @IsString()
  @MaxLength(255)
  content_hash: string | null;

  @IsDateString()
  uploaded_at: string;
}
