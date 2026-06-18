import { IsString, IsArray, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class FolderStatusMappingItemDto {
  @IsString()
  @IsNotEmpty()
  folderName: string;

  @IsString()
  @IsNotEmpty()
  processStage: string;
}

export class UpdateFolderStatusMappingDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FolderStatusMappingItemDto)
  mappings: FolderStatusMappingItemDto[];
}

export class UpdateExcludedFoldersDto {
  @IsArray()
  @IsString({ each: true })
  folders: string[];
}

export class UpdateAutoContactExcludedFoldersDto {
  @IsArray()
  @IsString({ each: true })
  folders: string[];
}
