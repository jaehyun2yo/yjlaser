import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export class EnrollmentStatusDto {
  @IsString()
  @MinLength(22)
  @MaxLength(86)
  @Matches(BASE64URL_PATTERN)
  public enrollmentAttemptId!: string;

  @IsString()
  @MinLength(43)
  @MaxLength(43)
  @Matches(BASE64URL_PATTERN)
  public refreshCredential!: string;
}
