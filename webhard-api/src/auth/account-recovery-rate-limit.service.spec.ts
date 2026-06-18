import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountRecoveryRateLimitService } from './account-recovery-rate-limit.service';

describe('AccountRecoveryRateLimitService', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.clearAllMocks();
  });

  it('production에서 Upstash 또는 fingerprint secret이 없으면 fail closed 한다', async () => {
    process.env.NODE_ENV = 'production';
    const config = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService;
    const service = new AccountRecoveryRateLimitService(config);

    await expect(
      service.checkPreLookup({
        flow: 'find-id',
        ip: '1.2.3.4',
        fingerprint: 'fingerprint-hash',
      })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
