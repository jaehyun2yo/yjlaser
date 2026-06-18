import { Module } from '@nestjs/common';
import { NumberService } from './number.service';

@Module({
  providers: [NumberService],
  exports: [NumberService],
})
export class NumberModule {}
