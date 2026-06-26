import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSyncLogDto, SyncLogStatus } from './sync-log.dto';

describe('CreateSyncLogDto contactId', () => {
  it('UUID contactId를 허용한다', async () => {
    const dto = plainToInstance(CreateSyncLogDto, {
      filename: 'file.dxf',
      status: SyncLogStatus.SYNCED,
      contactId: '11111111-2222-4333-8444-555555555555',
    });

    const errors = await validate(dto);

    expect(errors.find((error) => error.property === 'contactId')).toBeUndefined();
  });

  it('legacy numeric contactId는 audit text로 변환한다', async () => {
    const dto = plainToInstance(CreateSyncLogDto, {
      filename: 'file.dxf',
      status: SyncLogStatus.SYNCED,
      contactId: 123,
    });

    const errors = await validate(dto);

    expect(dto.contactId).toBe('123');
    expect(errors.find((error) => error.property === 'contactId')).toBeUndefined();
  });

  it('DB varchar 길이를 넘는 contactId는 validation에서 거부한다', async () => {
    const dto = plainToInstance(CreateSyncLogDto, {
      filename: 'file.dxf',
      status: SyncLogStatus.SYNCED,
      contactId: 'x'.repeat(65),
    });

    const errors = await validate(dto);

    const contactIdError = errors.find((error) => error.property === 'contactId');
    expect(contactIdError?.constraints).toHaveProperty('maxLength');
  });
});
