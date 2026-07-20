import { IsString } from 'class-validator';

export class DeviceTokenExchangeDto {
  @IsString()
  public deviceId!: string;

  @IsString()
  public refreshCredential!: string;

  @IsString()
  public nextRefreshCredential!: string;

  @IsString()
  public refreshRequestId!: string;
}
