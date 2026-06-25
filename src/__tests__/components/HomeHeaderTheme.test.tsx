import { render, screen, within } from '@testing-library/react';
import HomeHeader from '@/components/HomeHeader';

jest.mock('@/app/actions/auth', () => ({
  logoutAction: jest.fn(),
}));

describe('HomeHeader section contrast theme', () => {
  it('uses V1 public navigation links on the homepage', () => {
    render(<HomeHeader />);

    expect(screen.getByRole('banner')).toHaveClass('fixed');

    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
    expect(within(nav).getByRole('link', { name: '소개' })).toHaveAttribute('href', '/about');
    expect(within(nav).getByRole('link', { name: '포트폴리오' })).toHaveAttribute(
      'href',
      '/portfolio'
    );
    expect(within(nav).getByRole('link', { name: '문의하기' })).toHaveAttribute('href', '/contact');
  });
});
