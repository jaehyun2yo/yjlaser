import { render, screen, within } from '@testing-library/react';
import HomeHeader from '@/components/HomeHeader';

jest.mock('@/app/actions/auth', () => ({
  logoutAction: jest.fn(),
}));

describe('HomeHeader section contrast theme', () => {
  it('uses Spring/Summer navigation text on the light homepage hero', () => {
    render(<HomeHeader />);

    expect(screen.getByRole('banner')).toHaveClass('text-[#44394c]');

    const nav = screen.getByRole('navigation', { name: '홈 섹션' });
    expect(within(nav).getByRole('link', { name: 'What we do' })).toHaveAttribute(
      'href',
      '#what-we-do'
    );
    expect(within(nav).getByRole('link', { name: 'Our work' })).toHaveAttribute(
      'href',
      '#our-work'
    );
    expect(within(nav).getByRole('link', { name: 'About us' })).toHaveAttribute(
      'href',
      '#about-us'
    );
  });
});
