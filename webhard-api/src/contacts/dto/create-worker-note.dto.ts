import { IsString, IsIn, MaxLength } from 'class-validator';

export class CreateWorkerNoteDto {
  @IsString()
  @IsIn(['memo', 'issue', 'request'])
  type: string;

  @IsString()
  @MaxLength(500)
  content: string;

  @IsString()
  createdBy: string;
}
