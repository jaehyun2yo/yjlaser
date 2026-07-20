import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const SEMVER_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*)|(?:\d*[A-Za-z-][0-9A-Za-z-]*))(?:\.(?:(?:0|[1-9]\d*)|(?:\d*[A-Za-z-][0-9A-Za-z-]*)))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export class EnrollDeviceDto {
  @IsString()
  @MinLength(43)
  @MaxLength(43)
  @Matches(BASE64URL_PATTERN)
  public enrollmentCode!: string;

  @IsString()
  @MinLength(22)
  @MaxLength(86)
  @Matches(BASE64URL_PATTERN)
  public enrollmentAttemptId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  @Matches(/^[^\u0000-\u001F\u007F]+$/)
  public displayName!: string;

  @IsString()
  @MinLength(43)
  @MaxLength(43)
  @Matches(BASE64URL_PATTERN)
  public refreshCredential!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(20)
  @Matches(SEMVER_PATTERN)
  public appVersion?: string;
}
