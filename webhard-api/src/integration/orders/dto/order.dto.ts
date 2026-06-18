import { IsString, IsOptional, IsInt, IsEnum, IsIn, Min, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export enum ContactStatus {
  RECEIVED = 'received',
  DRAWING = 'drawing',
  CONFIRMED = 'confirmed',
  PRODUCTION = 'production',
  CUTTING = 'cutting',
  FINISHING = 'finishing',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
  ON_HOLD = 'on_hold',
}

// 하위 호환을 위해 기존 OrderStatus도 유지 (deprecated)
export const OrderStatus = ContactStatus;

export enum OrderPriority {
  URGENT = 'urgent',
  NORMAL = 'normal',
  LOW = 'low',
}

// 통합 상태 전환 유효성 검사 맵 (9단계)
export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  received: ['drawing', 'confirmed', 'on_hold'],
  drawing: ['confirmed', 'received', 'on_hold'],
  confirmed: ['production', 'drawing', 'completed', 'on_hold'],
  production: ['cutting', 'confirmed', 'on_hold'],
  cutting: ['finishing', 'delivered', 'completed', 'on_hold'],
  finishing: ['delivered', 'cutting', 'on_hold'],
  delivered: [],
  completed: [],
  on_hold: ['received', 'drawing', 'confirmed', 'production', 'cutting', 'finishing', 'completed'],
};

export class CreateOrderDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  contactId?: number;

  @IsOptional()
  @IsString()
  inquiryNumber?: string;

  @IsString()
  companyName: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  orderType?: string;

  @IsOptional()
  @IsEnum(OrderPriority)
  priority?: OrderPriority;

  @IsOptional()
  @IsString()
  webhardFolderId?: string;

  @IsOptional()
  @IsString()
  deliveryMethod?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @IsString()
  source?: string; // 'website' | 'webhard' | 'phone'

  @IsOptional()
  @IsString()
  originalFilename?: string; // 원본 파일명 (중복 체크용)
}

export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(OrderPriority)
  priority?: OrderPriority;

  @IsOptional()
  @IsString()
  webhardFolderId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  drawingFileCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dxfClassifiedCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dxfTotalPrice?: number;

  @IsOptional()
  @IsString()
  deliveryMethod?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  deliveryNote?: string;

  @IsOptional()
  @IsString()
  memo?: string;
}

export class UpdateOrderStatusDto {
  @IsEnum(ContactStatus)
  status: ContactStatus;

  @IsOptional()
  @IsString()
  actorName?: string;

  @IsOptional()
  @IsString()
  message?: string;
}

export class OrderQueryDto {
  @IsOptional()
  @IsEnum(ContactStatus)
  status?: ContactStatus;

  @IsOptional()
  @IsString()
  statuses?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsEnum(OrderPriority)
  priority?: OrderPriority;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  contactId?: number;

  @IsOptional()
  @IsString()
  workNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  sortBy?: string = 'created_at';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export enum WorkshopStage {
  CUTTING = 'cutting',
  POST_PROCESSING = 'post_processing',
  DELIVERY = 'delivery',
}

export const VALID_PROCESS_STAGES = [
  'drawing',
  'sample',
  'drawing_confirmed',
  'laser',
  'cutting',
  'creasing',
  'delivery',
] as const;

export class UpdateProcessStageDto {
  @IsOptional()
  @IsString()
  processStage?: string | null;

  @IsOptional()
  @IsString()
  actorName?: string;
}

export class WorkshopQueryDto {
  @IsOptional()
  @IsEnum(WorkshopStage)
  stage?: WorkshopStage;

  @IsOptional()
  @IsIn(['today', 'week', 'all'])
  period?: 'today' | 'week' | 'all';

  @IsOptional()
  @IsString()
  search?: string;
}
