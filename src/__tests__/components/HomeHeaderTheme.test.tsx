import { render, screen } from '@testing-library/react';
import HomeHeader from '@/components/HomeHeader';

jest.mock('@/app/actions/auth', () => ({
  logoutAction: jest.fn(),
}));

describe('HomeHeader section contrast theme', () => {
  it('uses dark navigation text on the light homepage hero', () => {
    render(<HomeHeader />);

    expect(screen.getByRole('link', { name: '소개' })).toHaveClass('text-neutral-950/80');
    expect(screen.getByRole('link', { name: '기업 로그인 페이지로 이동' })).toHaveClass(
      'text-brand'
    );
  });
});
