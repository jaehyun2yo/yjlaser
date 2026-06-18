import { IsString, IsOptional, IsEnum, Length } from 'class-validator';

export enum MachineType {
  LASER = 'laser',
  OSI_BENDING = 'osi_bending',
  KNIFE_BENDING = 'knife_bending',
  SAMPLE = 'sample',
}

export enum MachineStatus {
  ACTIVE = 'active',
  MAINTENANCE = 'maintenance',
  INACTIVE = 'inactive',
}

// Response DTOs
export class MachineResponseDto {
  id: string;
  name: string;
  type: string;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export class MachineListResponseDto {
  machines: MachineResponseDto[];
  total: number;
}

// Request DTOs
export class CreateMachineDto {
  @IsString()
  @Length(2, 100)
  name: string;

  @IsEnum(MachineType)
  type: MachineType;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateMachineDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsEnum(MachineType)
  type?: MachineType;

  @IsOptional()
  @IsEnum(MachineStatus)
  status?: MachineStatus;

  @IsOptional()
  @IsString()
  description?: string;
}
