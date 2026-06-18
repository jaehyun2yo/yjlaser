import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateBookingDto, BOOKING_STATUS_VALUES } from './update-booking.dto';

describe('UpdateBookingDto — status enum 검증', () => {
  it.each(BOOKING_STATUS_VALUES)('허용 값 %s 는 validation 통과', async (value) => {
    const dto = plainToInstance(UpdateBookingDto, { status: value });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('허용 외 값은 validation 실패 (isIn 제약)', async () => {
    const dto = plainToInstance(UpdateBookingDto, { status: 'foo' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('status');
    expect(errors[0].constraints).toHaveProperty('isIn');
  });

  it('status 미지정은 optional 로 통과', async () => {
    const dto = plainToInstance(UpdateBookingDto, { visitTimeSlot: '10:00' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('visitDate 는 IsDateString — 잘못된 포맷이면 실패', async () => {
    const dto = plainToInstance(UpdateBookingDto, { visitDate: 'not-a-date' });
    const errors = await validate(dto);
    const dateErr = errors.find((e) => e.property === 'visitDate');
    expect(dateErr).toBeDefined();
    expect(dateErr?.constraints).toHaveProperty('isDateString');
  });

  it('BOOKING_STATUS_VALUES 는 pending/confirmed/cancelled 3종', () => {
    expect([...BOOKING_STATUS_VALUES].sort()).toEqual(['cancelled', 'confirmed', 'pending']);
  });
});
