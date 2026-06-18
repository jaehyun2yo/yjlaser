import { render, screen } from '@testing-library/react';
import { ContactSubmitButton } from '@/app/contact/_components/ContactSubmitButton';

describe('ContactSubmitButton', () => {
  it('제출 전에는 문의하기 버튼으로 표시된다', () => {
    render(<ContactSubmitButton isSubmitting={false} onClick={jest.fn()} />);

    const button = screen.getByRole('button', { name: '문의하기' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('제출 중에는 전송중 애니메이션과 비활성 상태를 표시한다', () => {
    render(<ContactSubmitButton isSubmitting={true} onClick={jest.fn()} />);

    const button = screen.getByRole('button', { name: '전송중...' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('contact-submit-spinner')).toHaveClass('animate-spin');
  });
});
