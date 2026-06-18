import { render, screen } from '@testing-library/react';
import {
  BookingCancelButton,
  BookingChangeButton,
  MemoButton,
  WebhardMoveButton,
} from '@/components/ui/DashboardButtons';

describe('DashboardButtons', () => {
  it('예약 액션 버튼은 웹하드/메모 버튼과 같은 카드 액션 스타일을 사용한다', () => {
    const onClick = jest.fn();

    render(
      <div>
        <WebhardMoveButton onClick={onClick} />
        <MemoButton onClick={onClick} />
        <BookingChangeButton onClick={onClick} />
        <BookingCancelButton onClick={onClick} />
      </div>
    );

    const webhardButton = screen.getByRole('button', { name: '웹하드로 이동' });
    const memoButton = screen.getByRole('button', { name: '메모' });
    const bookingChangeButton = screen.getByRole('button', { name: '예약변경' });
    const bookingCancelButton = screen.getByRole('button', { name: '예약취소' });

    const expectedCardClasses = ['bg-white/90', 'border', 'border-gray-200', 'shadow-sm'];

    for (const button of [webhardButton, memoButton, bookingChangeButton, bookingCancelButton]) {
      expect(button).toHaveClass(...expectedCardClasses);
    }
  });
});
