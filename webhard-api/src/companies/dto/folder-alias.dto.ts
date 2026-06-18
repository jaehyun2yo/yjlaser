import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListFolderAliasesDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 50;
}

export class ApproveFolderAliasDto {
  @IsOptional()
  @IsBoolean()
  cascadeBackfill?: boolean = false;
}

export class CreateFolderAliasDto {
  @IsString()
  folderName!: string;

  @IsInt()
  companyId!: number;

  @IsOptional()
  @IsBoolean()
  cascadeBackfill?: boolean;
}
