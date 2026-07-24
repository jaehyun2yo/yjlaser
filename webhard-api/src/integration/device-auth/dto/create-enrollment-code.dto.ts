import { Transform } from 'class-transformer';
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  DEVICE_AUTH_PROGRAM_TYPES,
  DEVICE_CAPABILITY_PROFILES,
  type DeviceAuthProgramType,
  type DeviceCapabilityProfile,
} from '../device-auth.types';

export class CreateEnrollmentCodeDto {
  @IsIn(DEVICE_AUTH_PROGRAM_TYPES)
  public programType!: DeviceAuthProgramType;

  @IsIn(DEVICE_CAPABILITY_PROFILES)
  public capabilityProfile!: DeviceCapabilityProfile;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  @Matches(/^[^\u0000-\u001F\u007F]+$/)
  public expectedDisplayName!: string;
}
