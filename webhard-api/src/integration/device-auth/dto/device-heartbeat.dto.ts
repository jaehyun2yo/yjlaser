import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export const CANONICAL_SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export class DeviceHeartbeatDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(CANONICAL_SEMVER_PATTERN)
  public appVersion?: string;
}
