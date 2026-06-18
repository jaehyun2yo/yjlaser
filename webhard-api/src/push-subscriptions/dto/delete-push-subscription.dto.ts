import { IsString } from 'class-validator';

export class DeletePushSubscriptionDto {
  @IsString()
  workerId: string;

  @IsString()
  endpoint: string;
}
