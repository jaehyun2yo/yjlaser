import {
  IsOptional,
  IsString,
  IsBoolean,
  IsInt,
  IsEnum,
  IsArray,
  IsDateString,
} from 'class-validator';

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

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
  status?: string;

  @IsOptional()
  @IsString()
  processStage?: string | null;

  @IsOptional()
  @IsString()
  workNumber?: string;

  @IsOptional()
  @IsString()
  inquiryType?: string;

  @IsOptional()
  @IsString()
  memo?: string;

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
  drawingModification?: string;

  @IsOptional()
  @IsString()
  drawingNotes?: string;

  @IsOptional()
  @IsString()
  sampleNotes?: string;

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
  receiptMethod?: string;

  @IsOptional()
  @IsString()
  visitDate?: string;

  @IsOptional()
  @IsString()
  visitTimeSlot?: string;

  // Revision request
  @IsOptional()
  @IsString()
  revisionRequestTitle?: string;

  @IsOptional()
  @IsString()
  revisionRequestContent?: string;

  @IsOptional()
  @IsString()
  revisionRequestFileUrl?: string;

  @IsOptional()
  @IsString()
  revisionRequestFileName?: string;

  // Worker info
  @IsOptional()
  @IsString()
  workerMemo?: string;

  @IsOptional()
  @IsBoolean()
  workerIssue?: boolean;

  @IsOptional()
  @IsString()
  workerMemoBy?: string;

  @IsOptional()
  @IsString()
  webhardFolderId?: string;

  // Urgent
  @IsOptional()
  @IsBoolean()
  isUrgent?: boolean;

  @IsOptional()
  @IsDateString()
  urgentAt?: string;

  // Other
  @IsOptional()
  @IsString()
  attachmentFilename?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @IsOptional()
  @IsString()
  originalFilename?: string;

  @IsOptional()
  @IsString()
  referencePhotosUrls?: string;

  @IsOptional()
  @IsInt()
  drawingFileCount?: number;

  // Flags
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;

  @IsOptional()
  @IsBoolean()
  serviceMoldRequest?: boolean;

  @IsOptional()
  @IsBoolean()
  serviceDeliveryBrokerage?: boolean;
}

export class UpdateStatusDto {
  @IsString()
  @IsEnum([
    'received',
    'drawing',
    'confirmed',
    'production',
    'cutting',
    'finishing',
    'delivered',
    'on_hold',
    'completed',
  ])
  status!: string;

  @IsOptional()
  @IsString()
  actorType?: string;

  @IsOptional()
  @IsString()
  actorName?: string;

  @IsOptional()
  @IsString()
  companyName?: string;
}

export class UpdateProcessStageDto {
  @IsOptional()
  @IsString()
  processStage?: string | null;

  @IsOptional()
  @IsString()
  actorType?: string;

  @IsOptional()
  @IsString()
  actorName?: string;
}

export class UpdateInquiryTypeDto {
  @IsString()
  @IsEnum(['cutting_request', 'mold_request'])
  inquiryType!: string;

  @IsOptional()
  @IsString()
  actorType?: string;

  @IsOptional()
  @IsString()
  actorName?: string;
}

export class AcknowledgeBadgeDto {
  @IsString()
  @IsEnum(['booking_changed_at', 'delivery_method_changed_at'])
  field!: 'booking_changed_at' | 'delivery_method_changed_at';
}

export class CompleteLaserDto {
  @IsOptional()
  @IsString()
  actorType?: string;

  @IsOptional()
  @IsString()
  actorName?: string;
}

export class DeleteContactDto {
  @IsOptional()
  @IsBoolean()
  permanent?: boolean;
}

export class BatchDeleteDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}
