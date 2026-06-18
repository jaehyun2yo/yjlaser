import { IsString, IsOptional, IsBoolean, IsInt, IsEnum, IsEmail } from 'class-validator';

export class CreateContactDto {
  @IsString()
  name!: string;

  @IsString()
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  contactType?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  inquiryType?: string;

  // inquiryNumber: 서버 내부에서 NumberService가 자동 생성 (DTO에서 제거)
  // workNumber: production 전환 시 NumberService가 자동 생성 (DTO에서 제거)

  @IsOptional()
  @IsString()
  inquiryTitle?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  orderType?: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @IsString()
  originalFilename?: string;

  // Drawing info
  @IsOptional()
  @IsString()
  drawingFileUrl?: string;

  @IsOptional()
  @IsString()
  drawingFileName?: string;

  @IsOptional()
  @IsString()
  drawingType?: string;

  @IsOptional()
  @IsString()
  referencePhotosUrls?: string;

  @IsOptional()
  @IsString()
  drawingModification?: string;

  @IsOptional()
  @IsString()
  drawingNotes?: string;

  @IsOptional()
  @IsInt()
  drawingFileCount?: number;

  @IsOptional()
  @IsString()
  boxShape?: string;

  @IsOptional()
  @IsString()
  length?: string;

  @IsOptional()
  @IsString()
  width?: string;

  @IsOptional()
  @IsString()
  height?: string;

  @IsOptional()
  @IsString()
  material?: string;

  @IsOptional()
  @IsBoolean()
  hasPhysicalSample?: boolean;

  @IsOptional()
  @IsBoolean()
  hasReferencePhotos?: boolean;

  @IsOptional()
  @IsString()
  sampleNotes?: string;

  // Delivery info
  @IsOptional()
  @IsString()
  deliveryMethod?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  deliveryName?: string;

  @IsOptional()
  @IsString()
  deliveryPhone?: string;

  @IsOptional()
  @IsString()
  deliveryType?: string;

  @IsOptional()
  @IsString()
  deliveryCompanyName?: string;

  @IsOptional()
  @IsString()
  deliveryCompanyPhone?: string;

  @IsOptional()
  @IsString()
  deliveryCompanyAddress?: string;

  @IsOptional()
  @IsString()
  deliveryNote?: string;

  @IsOptional()
  @IsString()
  receiptMethod?: string;

  // Revision request
  @IsOptional()
  @IsString()
  revisionRequestTitle?: string;

  @IsOptional()
  @IsString()
  revisionRequestContent?: string;

  // Portfolio reference
  @IsOptional()
  @IsInt()
  portfolioReferenceId?: number;

  @IsOptional()
  @IsString()
  portfolioReferenceTitle?: string;

  @IsOptional()
  @IsString()
  portfolioReferenceUrl?: string;

  @IsOptional()
  @IsString()
  portfolioReferenceInfo?: string;

  // Process stage
  @IsOptional()
  @IsString()
  processStage?: string;

  // Worker info
  @IsOptional()
  @IsString()
  workerMemo?: string;

  @IsOptional()
  @IsBoolean()
  workerIssue?: boolean;

  @IsOptional()
  @IsString()
  webhardFolderId?: string;

  // Other
  @IsOptional()
  @IsString()
  referralSource?: string;

  @IsOptional()
  @IsString()
  visitLocation?: string;

  @IsOptional()
  @IsString()
  visitDate?: string;

  @IsOptional()
  @IsString()
  visitTimeSlot?: string;

  @IsOptional()
  @IsBoolean()
  serviceMoldRequest?: boolean;

  @IsOptional()
  @IsBoolean()
  serviceDeliveryBrokerage?: boolean;

  @IsOptional()
  @IsString()
  attachmentFilename?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}

export class BatchCreateContactDto {
  contacts!: CreateContactDto[];
}
