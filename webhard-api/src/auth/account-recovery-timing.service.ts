import { Injectable } from '@nestjs/common';

@Injectable()
export class AccountRecoveryTiming {
  private readonly productionFloorMs = 250;

  async waitForMinimum(startedAt: number): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    const floorMs = process.env.NODE_ENV === 'production' ? this.productionFloorMs : 0;
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = floorMs - elapsedMs;

    if (remainingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingMs));
    }
  }
}
