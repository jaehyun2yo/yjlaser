import { IsString, IsOptional } from 'class-validator';

export class WebhardSyncDto {
  @IsString()
  filename: string; // DXF 파일명 (예: "0219-1 원컴퍼니 제품명.DXF")

  @IsOptional()
  @IsString()
  webhardFolderId?: string; // 웹하드 폴더 ID

  @IsOptional()
  @IsString()
  filePath?: string; // 웹하드 내 파일 경로

  @IsOptional()
  @IsString()
  companyFolderName?: string; // 업체 폴더명 (파싱 힌트)
}
