import { IsString, IsOptional, IsArray, IsIn, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { RevisionFileDto } from './drawing-revision.dto';

export class CompanyDrawingUploadDto {
  @IsString()
  @IsIn(['revision_submit', 'mold_request', 'other'])
  purpose!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RevisionFileDto)
  files!: RevisionFileDto[];

  @IsOptional()
  @IsString()
  note?: string;

  @IsString()
  companyName!: string;
}

export class LinkWebhardFileDto {
  @IsString()
  fileId!: string;

  @IsString()
  @IsIn(['revision_submit', 'mold_request', 'other'])
  purpose!: string;

  @IsString()
  companyName!: string;
}
